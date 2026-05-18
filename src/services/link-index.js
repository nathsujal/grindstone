'use strict';

const fs = require('fs');
const path = require('path');
const { LINK_INDEX_FILE, CURRENT_INDEX_VERSION, INDEX_PERSIST_DELAY } = require('../constants');
const { scanMarkdownFiles } = require('../utils/fs-utils');

// Version registry for index migrations.
// Each version documents its schema and optional migration function.
// When a future version introduces a breaking change, add a migration here.
const INDEX_VERSIONS = {
  1: {
    description: 'Initial version — problem to referenced_by mapping',
    migration: null,
  },
};

// In-memory state
// Single instance per extension lifetime.
// Shape:
// {
//   version: 1,
//   built_at: 1705123456789,   ← unix ms timestamp
//   entries: {
//     '01_Arrays/001_two_sum': {
//       referenced_by: ['_progress/TRACKER.md', '01_Arrays/NOTES.md']
//     }
//   }
// }

let _index = null;
let _root = null;
let _dirty = false;
let _timer = null;

// Public API

/**
 * Boot the index. Called once on extension activate + before every command.
 * If index is missing or stale → full rebuild.
 * If already loaded and fresh → no-op.
 *
 * @param {string} root  absolute workspace root path
 */
async function ensureIndex(root) {
  _root = root;

  if (_index && !isStale(root)) return; // already fresh in memory

  const indexPath = getIndexPath(root);

  if (!fs.existsSync(indexPath)) {
    console.log('[link-index] no index found — building');
    await _buildIndex(root);
    return;
  }

  // Try loading from disk
  let loaded;
  try {
    loaded = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  } catch (e) {
    console.error('[link-index] failed to parse index — rebuilding:', e.message);
    await _buildIndex(root);
    return;
  }

  // Version mismatch → check for migration, else rebuild
  if (loaded.version !== CURRENT_INDEX_VERSION) {
    const migration = INDEX_VERSIONS[loaded.version]?.migration;
    if (migration) {
      console.log(`[link-index] migrating v${loaded.version} → v${CURRENT_INDEX_VERSION}`);
      migration(loaded);
      _index = loaded;
      _index.version = CURRENT_INDEX_VERSION;
      persistNow(root);
    } else {
      console.log(`[link-index] version mismatch (v${loaded.version}) — rebuilding`);
      await _buildIndex(root);
    }
    return;
  }

  // Stale → rebuild
  if (isStaleTimestamp(root, loaded.built_at)) {
    console.log('[link-index] stale — rebuilding');
    await _buildIndex(root);
    return;
  }

  // All good — load into memory
  _index = loaded;
  console.log(`[link-index] loaded from disk (${Object.keys(_index.entries).length} entries)`);
}

/**
 * Full rebuild from scratch. Scans every .md file in workspace.
 * Writes to disk immediately (not debounced).
 *
 * @param {string} root
 */
async function _buildIndex(root) {
  _root = root;
  console.log('[link-index] building full index...');
  const start = Date.now();

  const entries = {};

  // Discover all known problem dirs first
  const problemDirs = discoverAllProblemDirs(root);
  for (const relDir of problemDirs) {
    entries[relDir] = { referenced_by: [] };
  }

  // Scan all .md files and extract links
  const mdFiles = scanMarkdownFiles(root);
  for (const absFilePath of mdFiles) {
    const relFilePath = path.relative(root, absFilePath).split(path.sep).join('/');
    const links = extractMarkdownLinks(absFilePath);

    for (const rawLink of links) {
      const targetProblemRel = resolveLinkToProblemRel(root, absFilePath, rawLink);
      if (!targetProblemRel) continue;

      if (!entries[targetProblemRel]) {
        entries[targetProblemRel] = { referenced_by: [] };
      }

      if (!entries[targetProblemRel].referenced_by.includes(relFilePath)) {
        entries[targetProblemRel].referenced_by.push(relFilePath);
      }
    }
  }

  _index = {
    version: CURRENT_INDEX_VERSION,
    built_at: Date.now(),
    entries,
  };

  _dirty = false;
  persistNow(root); // write immediately on full rebuild

  console.log(
    `[link-index] built in ${Date.now() - start}ms — ${Object.keys(entries).length} entries`,
  );
}

/**
 * Get all files that contain a link pointing into the given problem dir.
 *
 * @param {string} root
 * @param {string} problemRelPath  e.g. '01_Arrays/001_two_sum'
 * @returns {string[]}  relative paths of referencing files
 */
function getReferencingFiles(root, problemRelPath) {
  if (!_index) {
    console.warn('[link-index] getReferencingFiles called before ensureIndex');
    return [];
  }
  const norm = problemRelPath.split(path.sep).join('/');
  return _index.entries[norm]?.referenced_by ?? [];
}

// Incremental mutations

/**
 * Called when a new problem folder is created.
 * Adds an empty entry — no files reference it yet.
 *
 * @param {string} root
 * @param {string} problemRelPath  e.g. '01_Arrays/003_jump_game'
 */
function onProblemCreated(root, problemRelPath) {
  if (!_index) return;
  const norm = problemRelPath.split(path.sep).join('/');
  if (!_index.entries[norm]) {
    _index.entries[norm] = { referenced_by: [] };
    markDirty(root);
    console.log(`[link-index] created entry: ${norm}`);
  }
}

/**
 * Called when a problem folder is renamed (after fs.renameSync).
 * Moves the entry and updates referenced_by paths if the referencing
 * file itself was also renamed (e.g. during topic renumber).
 *
 * @param {string} root
 * @param {string} oldRelPath   e.g. '01_Arrays/002_two_sum'
 * @param {string} newRelPath   e.g. '01_Arrays/001_two_sum'
 * @param {Map<string,string>} [renamedFiles]  optional map of old→new for any
 *                                              referencing files that were also renamed
 */
function onProblemRenamed(root, oldRelPath, newRelPath, renamedFiles = new Map()) {
  if (!_index) return;

  const oldNorm = oldRelPath.split(path.sep).join('/');
  const newNorm = newRelPath.split(path.sep).join('/');

  const existing = _index.entries[oldNorm];
  if (!existing) {
    // Entry didn't exist — create fresh
    _index.entries[newNorm] = { referenced_by: [] };
    markDirty(root);
    return;
  }

  // Move entry, updating any referenced_by paths that were also renamed
  const updatedRefs = existing.referenced_by.map((refPath) => {
    const absOld = path.join(root, refPath);
    const absNew = renamedFiles.get(absOld);
    if (absNew) return path.relative(root, absNew).split(path.sep).join('/');
    return refPath;
  });

  _index.entries[newNorm] = { referenced_by: updatedRefs };
  delete _index.entries[oldNorm];

  markDirty(root);
  console.log(`[link-index] renamed entry: ${oldNorm} → ${newNorm}`);
}

/**
 * Called when a problem folder is deleted.
 * Removes the entry entirely.
 *
 * @param {string} root
 * @param {string} problemRelPath
 */
function onProblemDeleted(root, problemRelPath) {
  if (!_index) return;
  const norm = problemRelPath.split(path.sep).join('/');
  if (_index.entries[norm]) {
    delete _index.entries[norm];
    markDirty(root);
    console.log(`[link-index] deleted entry: ${norm}`);
  }
}

/**
 * Called when a single .md file changes (saved by user or written by extension).
 * Re-scans only that file. Removes its old contributions, adds new ones.
 *
 * @param {string} root
 * @param {string} absFilePath  absolute path of the changed file
 */
function onFileChanged(root, absFilePath) {
  if (!_index) return;
  if (!fs.existsSync(absFilePath)) return;

  const relFilePath = path.relative(root, absFilePath).split(path.sep).join('/');

  // Step 1: Remove this file from ALL entries' referenced_by lists
  for (const entry of Object.values(_index.entries)) {
    const idx = entry.referenced_by.indexOf(relFilePath);
    if (idx !== -1) entry.referenced_by.splice(idx, 1);
  }

  // Step 2: Re-extract links from the changed file
  const links = extractMarkdownLinks(absFilePath);

  // Step 3: Re-add this file to entries it now links to
  for (const rawLink of links) {
    const targetProblemRel = resolveLinkToProblemRel(root, absFilePath, rawLink);
    if (!targetProblemRel) continue;

    if (!_index.entries[targetProblemRel]) {
      _index.entries[targetProblemRel] = { referenced_by: [] };
    }

    if (!_index.entries[targetProblemRel].referenced_by.includes(relFilePath)) {
      _index.entries[targetProblemRel].referenced_by.push(relFilePath);
    }
  }

  markDirty(root);
  console.log(`[link-index] re-indexed file: ${relFilePath}`);
}

/**
 * Called when a .md file is deleted.
 * Removes it from all referenced_by lists.
 *
 * @param {string} root
 * @param {string} absFilePath
 */
function onFileDeleted(root, absFilePath) {
  if (!_index) return;
  const relFilePath = path.relative(root, absFilePath).split(path.sep).join('/');

  for (const entry of Object.values(_index.entries)) {
    const idx = entry.referenced_by.indexOf(relFilePath);
    if (idx !== -1) entry.referenced_by.splice(idx, 1);
  }

  markDirty(root);
  console.log(`[link-index] removed deleted file: ${relFilePath}`);
}

/**
 * Force-flush dirty index to disk immediately.
 * Call from extension deactivate() to guarantee no data loss.
 */
function flushIndex() {
  if (!_root) return;
  // Clear timer unconditionally — prevents leak if persistNow ran
  // from the timer callback just before this flushIndex call.
  clearTimeout(_timer);
  _timer = null;
  if (_dirty) {
    persistNow(_root);
  }
}

// Internal helpers

function getIndexPath(root) {
  return path.join(root, LINK_INDEX_FILE);
}

/**
 * Check if in-memory index is stale relative to filesystem.
 * Compares index built_at vs newest .md mtime.
 */
function isStale(root) {
  if (!_index) return true;
  return isStaleTimestamp(root, _index.built_at);
}

function isStaleTimestamp(root, builtAt) {
  try {
    const mdFiles = scanMarkdownFiles(root);
    if (mdFiles.length === 0) return false;
    const newestMtime = Math.max(
      ...mdFiles.map((f) => {
        try {
          return fs.statSync(f).mtimeMs;
        } catch {
          return 0;
        }
      }),
    );
    return newestMtime > builtAt;
  } catch {
    return true; // if we can't check, assume stale
  }
}

/**
 * Mark index dirty and schedule a debounced disk write.
 */
function markDirty(root) {
  _dirty = true;
  clearTimeout(_timer);
  _timer = setTimeout(() => persistNow(root), INDEX_PERSIST_DELAY);
}

/**
 * Write _index to disk synchronously. Clears dirty flag.
 */
function persistNow(root) {
  if (!_index) return;
  try {
    const indexPath = getIndexPath(root);
    _index.built_at = Date.now();
    fs.writeFileSync(indexPath, JSON.stringify(_index, null, 2), 'utf8');
    _dirty = false;
    console.log('[link-index] persisted to disk');
  } catch (e) {
    console.error('[link-index] failed to persist:', e.message);
  }
}

/**
 * Extract all raw link targets from a markdown file.
 * Only returns link targets (the part inside parentheses).
 * Skips external URLs.
 *
 * @param {string} absFilePath
 * @returns {string[]}
 */
function extractMarkdownLinks(absFilePath) {
  const links = [];
  let content;
  try {
    content = fs.readFileSync(absFilePath, 'utf8');
  } catch {
    return links;
  }

  // Match [label](target) — capture only target
  const linkRegex = /\[([^\]]*)\]\(([^)]+)\)/g;
  let match;
  while ((match = linkRegex.exec(content)) !== null) {
    const target = match[2].trim();
    // Skip external URLs and mailto
    if (target.startsWith('http') || target.startsWith('mailto')) continue;
    // Skip anchor-only links
    if (target.startsWith('#')) continue;
    links.push(target);
  }
  return links;
}

/**
 * Resolve a raw link target (relative path from a .md file) to a
 * problem-relative path from workspace root.
 * Returns null if the link doesn't point into any known problem folder.
 *
 * Example:
 *   absFilePath = '/DSA/_progress/TRACKER.md'
 *   rawLink     = '../01_Arrays/001_two_sum/PROBLEM.md'
 *   returns     = '01_Arrays/001_two_sum'
 *
 * @param {string} root
 * @param {string} absFilePath   absolute path of the file containing the link
 * @param {string} rawLink       raw link target from markdown
 * @returns {string|null}
 */
function resolveLinkToProblemRel(root, absFilePath, rawLink) {
  try {
    const fileDir = path.dirname(absFilePath);
    const absTarget = path.resolve(fileDir, rawLink);

    // Must be inside root
    if (!absTarget.startsWith(root)) return null;

    const relTarget = path.relative(root, absTarget).split(path.sep).join('/');

    // Walk up from the resolved target to find a 2-segment path (topic/problem)
    // A problem dir is always exactly 2 levels deep: topic/problem
    const parts = relTarget.split('/');

    // parts[0] = topic folder, parts[1] = problem folder
    // If parts.length >= 2 and parts[0] is a topic dir and parts[1] looks like
    // a problem dir (starts with digits), it's a valid problem reference
    if (parts.length < 2) return null;

    const topicPart = parts[0];
    const problemPart = parts[1];

    // Topic must not be a special folder
    if (topicPart.startsWith('_') || topicPart.startsWith('.')) return null;

    // Problem folder must start with digits (e.g. 001_two_sum)
    if (!/^\d+_/.test(problemPart)) return null;

    return `${topicPart}/${problemPart}`;
  } catch {
    return null;
  }
}

/**
 * Discover all problem directories in workspace.
 * Returns array of relative paths like ['01_Arrays/001_two_sum', ...]
 *
 * @param {string} root
 * @returns {string[]}
 */
function discoverAllProblemDirs(root) {
  const results = [];
  const isDir = (p) => {
    try {
      return fs.statSync(p).isDirectory();
    } catch {
      return false;
    }
  };
  const skip = (n) => n.startsWith('_') || n.startsWith('.');

  let topics;
  try {
    topics = fs.readdirSync(root).filter((d) => !skip(d) && isDir(path.join(root, d)));
  } catch {
    return results;
  }

  for (const topic of topics) {
    const topicPath = path.join(root, topic);
    let problems;
    try {
      problems = fs
        .readdirSync(topicPath)
        .filter((d) => !skip(d) && /^\d+_/.test(d) && isDir(path.join(topicPath, d)));
    } catch {
      continue;
    }

    for (const prob of problems) {
      results.push(`${topic}/${prob}`);
    }
  }
  return results;
}

/**
 * Get current index statistics for diagnostics.
 *
 * @param {string} root
 * @returns {{ entryCount: number, builtAt: string, version: number, isDirty: boolean, staleness: string } | { status: string }}
 */
function getIndexStats(_root) {
  if (!_index) {
    return { status: 'not initialized' };
  }

  const age = Date.now() - _index.built_at;
  let staleness;
  if (age < 60000) staleness = 'fresh (< 1 min)';
  else if (age < 3600000) staleness = `ok (${Math.floor(age / 60000)} min ago)`;
  else staleness = `stale (${Math.floor(age / 3600000)} hr ago)`;

  return {
    entryCount: Object.keys(_index.entries).length,
    builtAt: new Date(_index.built_at).toISOString(),
    version: _index.version,
    isDirty: _dirty,
    staleness,
  };
}

module.exports = {
  ensureIndex,
  getReferencingFiles,
  onProblemCreated,
  onProblemRenamed,
  onProblemDeleted,
  onFileChanged,
  onFileDeleted,
  flushIndex,
  getIndexStats,
};
