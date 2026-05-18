'use strict';

const vscode = require('vscode');
const path   = require('path');
const { getWorkspaceRoot }    = require('./utils/workspace');
const { ensureIndex, flushIndex } = require('./services/link-index');
const { startWatcher }        = require('./services/index-watcher');

// feature commands
const { cmdOpenProblem }    = require('./features/problem-picker');
const { cmdNewProblem }     = require('./features/new-problem');
const { cmdDeleteProblem }  = require('./features/delete-problem');
const { cmdClearLayout }    = require('./features/clear-layout');
const { cmdOpenProblemPath } = require('./features/problem-picker');
const { cmdRunSolution }     = require('./features/run-solution');

async function activate(context) {
  console.log('[grindstone] activating');

  // Boot index
  const root = getWorkspaceRoot();
  if (root) {
    // ensureIndex handles: missing → build, stale → rebuild, fresh → no-op
    await ensureIndex(root);

    // Start file watcher — auto-disposed when extension deactivates
    const watcher = startWatcher(root);
    context.subscriptions.push(watcher);
  }

  // Register commands
  // Wrap every command with ensureIndex so index is always fresh before use
  const register = (id, fn) => {
    context.subscriptions.push(
      vscode.commands.registerCommand(id, async (...args) => {
        const r = getWorkspaceRoot();
        if (r) await ensureIndex(r);   // staleness check before every command
        return fn(...args);
      })
    );
  };

  register('grindstone.openProblem',     cmdOpenProblem);
  register('grindstone.openProblemPath', cmdOpenProblemPath);
  register('grindstone.newProblem',      cmdNewProblem);
  register('grindstone.deleteProblem',   cmdDeleteProblem);
  register('grindstone.clearLayout',     cmdClearLayout);
  register('grindstone.runSolution',     cmdRunSolution);
  console.log('[grindstone] activated');
}

function deactivate() {
  // Guaranteed flush — writes any dirty index before extension unloads
  flushIndex();
  console.log('[grindstone] deactivated');
}

module.exports = { activate, deactivate };