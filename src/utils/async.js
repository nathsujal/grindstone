'use strict';

const vscode = require('vscode');

// wait ms
function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// poll predicate until true or timeout
async function pollUntil(predicate, { interval = 100, timeout = 3000 } = {}) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await sleep(interval);
  }
  return !!predicate();
}

// show doc in view column
function showDoc(uri, viewColumn) {
  return vscode.window.showTextDocument(uri, {
    viewColumn,
    preview: false,
    preserveFocus: false
  });
}

module.exports = { sleep, pollUntil, showDoc };