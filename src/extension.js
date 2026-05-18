'use strict';

const vscode = require('vscode');
const { getWorkspaceRoot } = require('./utils/workspace');
const { ensureIndex, flushIndex } = require('./services/link-index');
const { startWatcher } = require('./services/index-watcher');
const { info } = require('./utils/logger');
const { getLastOpenedProblem, getProblemCount } = require('./utils/state');

/**
 * Register a command with lazy module loading.
 * Defers require() until first invocation — improves activation time.
 *
 * @param {string} id          command id e.g. 'grindstone.openProblem'
 * @param {string} modulePath  relative require path e.g. './features/problem-picker'
 * @param {string} exportName  exported function name e.g. 'cmdOpenProblem'
 * @param {vscode.ExtensionContext} context
 */
function registerLazy(id, modulePath, exportName, context) {
  context.subscriptions.push(
    vscode.commands.registerCommand(id, async (...args) => {
      const root = getWorkspaceRoot();
      if (root) await ensureIndex(root);
      const mod = require(modulePath);
      return mod[exportName](...args);
    }),
  );
}

async function activate(context) {
  info('grindstone', 'activating');

  // Boot index — eager because index freshness matters before any command runs
  const root = getWorkspaceRoot();
  if (root) {
    await ensureIndex(root);

    // Start file watcher — auto-disposed when extension deactivates
    const watcher = startWatcher(root);
    context.subscriptions.push(watcher);

    // Restore persistent state
    const lastProblem = getLastOpenedProblem(context.workspaceState);
    if (lastProblem) {
      info('grindstone', `last opened: ${lastProblem}`);
    }

    const problemCount = getProblemCount(context.workspaceState);
    if (problemCount > 0) {
      info('grindstone', `cached problem count: ${problemCount}`);
    }
  }

  // Lazy-load feature commands — defers require() until first invocation
  // Pass context so commands can persist state via workspaceState/globalState
  registerLazy('grindstone.openProblem', './features/problem-picker', 'cmdOpenProblem', context);
  registerLazy('grindstone.openProblemPath', './features/problem-picker', 'cmdOpenProblemPath', context);
  registerLazy('grindstone.newProblem', './features/new-problem', 'cmdNewProblem', context);
  registerLazy('grindstone.deleteProblem', './features/delete-problem', 'cmdDeleteProblem', context);
  registerLazy('grindstone.clearLayout', './features/clear-layout', 'cmdClearLayout', context);
  registerLazy('grindstone.runSolution', './features/run-solution', 'cmdRunSolution', context);

  // Diagnostics command — does not need ensureIndex wrapper
  context.subscriptions.push(
    vscode.commands.registerCommand('grindstone.showIndexStats', async () => {
      const root = getWorkspaceRoot();
      if (!root) return;
      const { getIndexStats } = require('./services/link-index');
      const stats = getIndexStats(root);
      const lines = Object.entries(stats).map(([k, v]) => `${k}: ${v}`);
      vscode.window.showInformationMessage(`Index Stats\n${lines.join('\n')}`);
    }),
  );

  info('grindstone', 'activated');
}

function deactivate() {
  // Guaranteed flush — writes any dirty index before extension unloads
  flushIndex();
  info('grindstone', 'deactivated');
}

module.exports = { activate, deactivate };
