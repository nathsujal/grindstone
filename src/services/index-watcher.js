'use strict';

const vscode = require('vscode');
const { onFileChanged, onFileDeleted } = require('./link-index');

// Global debounce: single timer for ALL file changes
// Batches multiple saves together into one reindex call
const _changedFiles = new Set();
let _batchTimer = null;
const BATCH_DEBOUNCE_MS = 500;

/**
 * Start watching all .md files under root.
 * Returns the watcher — caller must push to context.subscriptions.
 *
 * @param {string} root
 * @returns {vscode.FileSystemWatcher}
 */
function startWatcher(root) {
  const pattern = new vscode.RelativePattern(root, '**/*.md');
  const watcher = vscode.workspace.createFileSystemWatcher(pattern);

  watcher.onDidChange((uri) => scheduleReindex(root, uri.fsPath));
  watcher.onDidCreate((uri) => scheduleReindex(root, uri.fsPath));

  watcher.onDidDelete((uri) => {
    const absPath = uri.fsPath;
    _changedFiles.delete(absPath); // no need to reindex deleted file
    onFileDeleted(root, absPath);
  });

  console.log('[index-watcher] watching *.md under', root);
  return watcher;
}

/**
 * Batch file changes together. Single debounce timer resets on each change.
 * When timer fires, all changed files are reindexed at once.
 *
 * @param {string} root
 * @param {string} absFilePath
 */
function scheduleReindex(root, absFilePath) {
  _changedFiles.add(absFilePath);

  if (_batchTimer) clearTimeout(_batchTimer);

  _batchTimer = setTimeout(() => {
    const files = [..._changedFiles];
    _changedFiles.clear();
    _batchTimer = null;

    for (const f of files) {
      onFileChanged(root, f);
    }
  }, BATCH_DEBOUNCE_MS);
}

module.exports = { startWatcher };
