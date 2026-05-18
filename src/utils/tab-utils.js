'use strict';

const vscode = require('vscode');
const path = require('path');

/**
 * Detect the open problem directory from current tab groups.
 * Looks for any open tab whose path is: root/topic/problem/file
 * Returns absolute problem folder path, or null.
 *
 * @param {string} root  absolute workspace root
 * @returns {string|null}
 */
function getOpenProblemDir(root) {
  const openTabPaths = vscode.window.tabGroups.all
    .flatMap((g) => g.tabs)
    .map((t) => t?.input?.uri?.fsPath)
    .filter(Boolean);

  for (const tabPath of openTabPaths) {
    const rel = path.relative(root, tabPath);
    if (rel.startsWith('..')) continue;

    const parts = rel.split(path.sep);
    // Needs at least: topic / problem / file  (3 parts)
    if (parts.length < 3) continue;
    // Skip _progress, _templates, .vscode etc
    if (parts[0].startsWith('_') || parts[0].startsWith('.')) continue;
    // Problem folder must start with digits e.g. 001_two_sum
    if (!/^\d+_/.test(parts[1])) continue;

    return path.join(root, parts[0], parts[1]);
  }
  return null;
}

module.exports = { getOpenProblemDir };
