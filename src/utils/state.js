'use strict';

/**
 * Persistent state manager using VS Code's Memento API.
 * Wraps workspaceState and globalState with typed accessors.
 */

const STATE_KEYS = {
  LAST_OPENED_PROBLEM: 'lastOpenedProblem',
  LAST_ACTIVE_LANGUAGE: 'lastActiveLanguage',
  LAYOUT_STATE: 'layoutState',
  PROBLEM_COUNT: 'problemCount',
};

/**
 * Get the last opened problem path.
 *
 * @param {vscode.Memento} state
 * @returns {string|null}
 */
function getLastOpenedProblem(state) {
  return state.get(STATE_KEYS.LAST_OPENED_PROBLEM, null);
}

/**
 * Save the last opened problem path.
 *
 * @param {vscode.Memento} state
 * @param {string} problemPath
 */
async function setLastOpenedProblem(state, problemPath) {
  await state.update(STATE_KEYS.LAST_OPENED_PROBLEM, problemPath);
}

/**
 * Get the last active language.
 *
 * @param {vscode.Memento} state
 * @returns {string}
 */
function getLastActiveLanguage(state) {
  return state.get(STATE_KEYS.LAST_ACTIVE_LANGUAGE, 'python');
}

/**
 * Save the last active language.
 *
 * @param {vscode.Memento} state
 * @param {string} language
 */
async function setLastActiveLanguage(state, language) {
  await state.update(STATE_KEYS.LAST_ACTIVE_LANGUAGE, language);
}

/**
 * Get cached problem count.
 *
 * @param {vscode.Memento} state
 * @returns {number}
 */
function getProblemCount(state) {
  return state.get(STATE_KEYS.PROBLEM_COUNT, 0);
}

/**
 * Update cached problem count.
 *
 * @param {vscode.Memento} state
 * @param {number} count
 */
async function setProblemCount(state, count) {
  await state.update(STATE_KEYS.PROBLEM_COUNT, count);
}

module.exports = {
  STATE_KEYS,
  getLastOpenedProblem,
  setLastOpenedProblem,
  getLastActiveLanguage,
  setLastActiveLanguage,
  getProblemCount,
  setProblemCount,
};
