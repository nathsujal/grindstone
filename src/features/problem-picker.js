'use strict';

const vscode = require('vscode');
const path = require('path');
const { getWorkspaceRoot, scanProblems } = require('../utils/workspace');
const { exists, isDir } = require('../utils/fs-utils');
const { showProblemPicker } = require('../ui/picker');
const { openLayout } = require('../ui/layout');

// open problem via QuickPick
async function cmdOpenProblem() {
  try {
    const root = getWorkspaceRoot();
    if (!root) return;

    const items = scanProblems(root);
    const picked = await showProblemPicker(items);
    if (!picked) return;

    await openLayout(picked.fullPath);
  } catch (err) {
    vscode.window.showErrorMessage(`DSA Layout error: ${err.message}`);
    console.error('[problem-picker] error:', err.message, err.stack);
  }
}

// open problem from context menu (path argument)
async function cmdOpenProblemPath(problemPath) {
  try {
    if (!problemPath) {
      vscode.window.showErrorMessage('DSA Layout: no path provided.');
      return;
    }
    const root = getWorkspaceRoot();
    if (!root) return;

    const resolved = path.isAbsolute(problemPath) ? problemPath : path.join(root, problemPath);
    if (!exists(resolved) || !isDir(resolved)) {
      vscode.window.showErrorMessage(`DSA Layout: Invalid path "${problemPath}"`);
      return;
    }
    await openLayout(resolved);
  } catch (err) {
    vscode.window.showErrorMessage(`DSA Layout error: ${err.message}`);
    console.error('[problem-picker] error:', err.message, err.stack);
  }
}

module.exports = { cmdOpenProblem, cmdOpenProblemPath };