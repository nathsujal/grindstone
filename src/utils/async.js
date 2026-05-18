'use strict';

const vscode = require('vscode');

/**
 * Wait ms.
 *
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Poll predicate until true or timeout.
 *
 * @param {() => boolean} predicate
 * @param {{ interval?: number, timeout?: number }} opts
 * @returns {Promise<boolean>}
 */
async function pollUntil(predicate, { interval = 100, timeout = 3000 } = {}) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await sleep(interval);
  }
  return !!predicate();
}

/**
 * Show doc in view column.
 *
 * @param {vscode.Uri} uri
 * @param {vscode.ViewColumn} viewColumn
 * @returns {Thenable<vscode.TextEditor>}
 */
function showDoc(uri, viewColumn) {
  return vscode.window.showTextDocument(uri, {
    viewColumn,
    preview: false,
    preserveFocus: false,
  });
}

/**
 * Wait until a specific URI appears as an open tab.
 *
 * @param {vscode.Uri} uri
 * @param {{ timeout?: number }} opts
 * @returns {Promise<boolean>}
 */
async function waitForTab(uri, { timeout = 1500 } = {}) {
  const target = uri.fsPath;
  return pollUntil(
    () =>
      vscode.window.tabGroups.all.some((g) => g.tabs.some((t) => t.input?.uri?.fsPath === target)),
    { interval: 30, timeout },
  );
}

module.exports = { sleep, pollUntil, showDoc, waitForTab };
