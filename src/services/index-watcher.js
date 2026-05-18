'use strict';

const vscode = require('vscode');
const path   = require('path');
const { onFileChanged, onFileDeleted } = require('./link-index');

// Debounce map: absFilePath → timer
// Prevents rapid-fire saves (e.g. auto-format on save) from triggering
// multiple re-index calls for the same file
const _pendingTimers = new Map();
const DEBOUNCE_MS = 300;

/**
 * Start watching all .md files under root.
 * Returns the watcher — caller must push to context.subscriptions.
 *
 * @param {string} root
 * @returns {vscode.FileSystemWatcher}
 */
function startWatcher(root) {
  // Watch all .md files anywhere in workspace
  const pattern = new vscode.RelativePattern(root, '**/*.md');
  const watcher  = vscode.workspace.createFileSystemWatcher(pattern);

  // File saved (created or changed)
  watcher.onDidChange(uri => scheduleReindex(root, uri.fsPath));
  watcher.onDidCreate(uri => scheduleReindex(root, uri.fsPath));

  // File deleted
  watcher.onDidDelete(uri => {
    const absPath = uri.fsPath;
    // Cancel any pending reindex for this file
    clearPending(absPath);
    onFileDeleted(root, absPath);
  });

  console.log('[index-watcher] watching *.md under', root);
  return watcher;
}

/**
 * Debounced reindex trigger for a single file.
 * If the same file changes multiple times within DEBOUNCE_MS,
 * only the last change triggers reindex.
 *
 * @param {string} root
 * @param {string} absFilePath
 */
function scheduleReindex(root, absFilePath) {
  clearPending(absFilePath);
  const timer = setTimeout(() => {
    _pendingTimers.delete(absFilePath);
    onFileChanged(root, absFilePath);
  }, DEBOUNCE_MS);
  _pendingTimers.set(absFilePath, timer);
}

function clearPending(absFilePath) {
  const existing = _pendingTimers.get(absFilePath);
  if (existing) {
    clearTimeout(existing);
    _pendingTimers.delete(absFilePath);
  }
}

module.exports = { startWatcher };