'use strict';

const fs   = require('fs');
const path = require('path');
const { scanMarkdownFiles } = require('./fs-utils');


/**
 * Update all markdown links across workspace that point into oldAbsDir,
 * rewriting them to point to newAbsDir instead.
 *
 * Handles relative paths correctly regardless of the referencing file's
 * depth — resolves to absolute, swaps dir, converts back to relative.
 *
 * @param {string} root        absolute workspace root
 * @param {string} oldAbsDir   old absolute path e.g. '/DSA/01_Arrays/002_two_sum'
 * @param {string} newAbsDir   new absolute path e.g. '/DSA/01_Arrays/001_two_sum'
 * @param {string[]} [onlyFiles]  optional — only scan these files (from index)
 *                                if omitted, scans all .md files in workspace
 */
function updateLinksAcrossWorkspace(root, oldAbsDir, newAbsDir, onlyFiles = null) {
  // Normalize separators (Windows safety)
  const normOld = path.normalize(oldAbsDir);
  const normNew = path.normalize(newAbsDir);

  const filesToScan = onlyFiles
    ? onlyFiles.map(f => path.isAbsolute(f) ? f : path.join(root, f))
    : scanMarkdownFiles(root);

  let updatedCount = 0;

  for (const absFilePath of filesToScan) {
    if (!fs.existsSync(absFilePath)) continue;

    let content;
    try {
      content = fs.readFileSync(absFilePath, 'utf8');
    } catch { continue; }

    const fileDir = path.dirname(absFilePath);

    const updated = content.replace(
      /(\[([^\]]*)\]\()([^)]+)(\))/g,
      (match, open, label, rawLink, close) => {
        // Skip external URLs
        if (rawLink.startsWith('http') || rawLink.startsWith('mailto')) {
          return match;
        }

        // Resolve link to absolute path
        let absLink;
        try {
          absLink = path.normalize(path.resolve(fileDir, rawLink));
        } catch {
          return match;
        }

        // Check if this link points into the old problem dir
        // Use startsWith with separator to avoid partial matches
        // e.g. old=001_two_sum should NOT match 001_two_sum_extra
        const oldWithSep = normOld.endsWith(path.sep)
          ? normOld
          : normOld + path.sep;

        if (absLink !== normOld && !absLink.startsWith(oldWithSep)) {
          return match;
        }

        // Compute new absolute target
        const remainder = absLink.slice(normOld.length);   // e.g. /PROBLEM.md or ''
        const newAbsLink = normNew + remainder;

        // Convert back to relative from this file
        const newRelLink = path.relative(fileDir, newAbsLink)
          .split(path.sep).join('/');   // always forward slashes in markdown

        console.log(
          `[md-updater] ${path.relative(root, absFilePath)}: ` +
          `${rawLink} → ${newRelLink}`
        );
        return `${open}${newRelLink}${close}`;
      }
    );

    if (updated !== content) {
      try {
        fs.writeFileSync(absFilePath, updated, 'utf8');
        updatedCount++;
      } catch (e) {
        console.error(`[md-updater] failed to write ${absFilePath}:`, e.message);
      }
    }
  }

  console.log(`[md-updater] updated links in ${updatedCount} files`);
}

/**
 * Update a problem's number cell in TRACKER.md.
 * Uses problem name (stable across renames) as the lookup key.
 *
 * Row format: | topic | number | name | difficulty | status | langs | date |
 * Indices:       [1]     [2]     [3]
 *
 * @param {string} trackerPath   absolute path to TRACKER.md
 * @param {string} topicName     e.g. '01_Arrays'
 * @param {string} problemName   snake_case name WITHOUT number, e.g. 'two_sum'
 * @param {string} newNumStr     e.g. '001'
 */
function updateTrackerRow(trackerPath, topicName, problemName, newNumStr) {
  if (!fs.existsSync(trackerPath)) return;

  try {
    const lines = fs.readFileSync(trackerPath, 'utf8').split('\n');
    let changed = false;

    const updated = lines.map(line => {
      if (!line.includes('|')) return line;

      const cells = line.split('|').map(c => c.trim());
      // cells[0] = '' (before first pipe), cells[1] = topic, cells[2] = number,
      // cells[3] = name, ...
      if (cells.length < 4) return line;

      const rowTopic = cells[1];
      const rowName  = cells[3];

      // Match by topic + name (name is stable, number changes)
      const topicMatches = rowTopic === topicName ||
        rowTopic.replace(/^\d+_/, '') === topicName.replace(/^\d+_/, '');
      const nameMatches  = rowName === problemName ||
        rowName.replace(/^\d+_/, '') === problemName;

      if (!topicMatches || !nameMatches) return line;

      // Replace number cell
      cells[2] = newNumStr;
      changed = true;

      // Rebuild pipe-delimited line preserving formatting
      return '| ' + cells.filter((_, i) => i > 0).join(' | ');
    });

    if (changed) {
      fs.writeFileSync(trackerPath, updated.join('\n'), 'utf8');
      console.log(`[md-updater] updated TRACKER.md row for ${problemName} → ${newNumStr}`);
    }
  } catch (e) {
    console.error('[md-updater] updateTrackerRow failed:', e.message);
  }
}

module.exports = {
  updateLinksAcrossWorkspace,
  updateTrackerRow,
};