'use strict';

const vscode = typeof process !== 'undefined' && process.env.VITEST ? null : require('vscode');

let _outputChannel = null;

/**
 * Get or create the Grindstone output channel.
 * Returns null in test environments.
 *
 * @returns {vscode.OutputChannel|null}
 */
function getOutputChannel() {
  if (!vscode) return null;
  if (!_outputChannel) {
    _outputChannel = vscode.window.createOutputChannel('Grindstone');
  }
  return _outputChannel;
}

/**
 * Log an info message.
 *
 * @param {string} module
 * @param {string} message
 */
function info(module, message) {
  const line = `[${new Date().toISOString()}] [${module}] ${message}`;
  console.log(line);
  const ch = getOutputChannel();
  if (ch) ch.appendLine(line);
}

/**
 * Log a warning message.
 *
 * @param {string} module
 * @param {string} message
 */
function warn(module, message) {
  const line = `[${new Date().toISOString()}] [${module}] WARN: ${message}`;
  console.warn(line);
  const ch = getOutputChannel();
  if (ch) ch.appendLine(line);
}

/**
 * Log an error message with optional stack trace.
 *
 * @param {string} module
 * @param {string} message
 * @param {Error} [err]
 */
function error(module, message, err) {
  const line = `[${new Date().toISOString()}] [${module}] ERROR: ${message}${err ? '\n' + err.stack : ''}`;
  console.error(line);
  const ch = getOutputChannel();
  if (ch) ch.appendLine(line);
}

/**
 * Dispose the output channel (call on extension deactivate).
 */
function dispose() {
  if (_outputChannel) {
    _outputChannel.dispose();
    _outputChannel = null;
  }
}

module.exports = { info, warn, error, dispose, getOutputChannel };
