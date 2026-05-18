'use strict';

const vscode = require('vscode');
const { clearLayout } = require('../ui/layout');

// clear current layout
async function cmdClearLayout() {
  try {
    await clearLayout();
    vscode.window.showInformationMessage('GrindStone: cleared');
  } catch (err) {
    vscode.window.showErrorMessage(`GrindStone error: ${err.message}`);
    console.error('[clear-layout] error:', err.message, err.stack);
  }
}

module.exports = { cmdClearLayout };
