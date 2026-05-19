'use strict';

const vscode = require('vscode');
const { getWorkspaceRoot } = require('./utils/workspace');
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
      const mod = require(modulePath);
      return mod[exportName](...args);
    }),
  );
}

async function activate(context) {
  info('grindstone', 'activating');

  // Restore persistent state
  const root = getWorkspaceRoot();
  if (root) {
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

  info('grindstone', 'activated');
}

function deactivate() {
  info('grindstone', 'deactivated');
}

module.exports = { activate, deactivate };
