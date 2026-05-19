'use strict';

const fs = require('fs');
const vscode = require('vscode');
const path = require('path');
const { isDir } = require('./fs-utils');

// get workspace root or show error
function getWorkspaceRoot() {
  const wf = vscode.workspace.workspaceFolders;
  if (!wf || wf.length === 0) {
    vscode.window.showErrorMessage('Grindstone: No workspace open. Open via dsa.code-workspace.');
    return null;
  }
  return wf[0].uri.fsPath;
}

// Validate workspace root is a DSA workspace (has TRACKER.md or topic folders)
function isValidDsaWorkspace(root) {
  const trackerPath = path.join(root, '_progress', 'TRACKER.md');
  return fs.existsSync(trackerPath) || discoverTopics(root).length > 0;
}

// skip folders starting with _ or .
const isSpecialFolder = (n) => n.startsWith('_') || n.startsWith('.');

// discover all topic folders
function discoverTopics(root) {
  const topics = [];
  try {
    const dirs = fs
      .readdirSync(root)
      .filter((d) => !isSpecialFolder(d))
      .filter((d) => isDir(path.join(root, d)));
    topics.push(...dirs.sort());
  } catch (e) {
    vscode.window.showErrorMessage(`Grindstone: Cannot read workspace: ${e.message}`);
  }
  return topics;
}

// parse problem number from folder name (e.g., "001_two_sum" -> 1)
function parseProblemNumber(folderName) {
  const match = folderName.match(/^(\d+)_/);
  return match ? parseInt(match[1], 10) : null;
}

// scan problems in a topic - returns sorted folder names
function scanProblemsInTopic(topicPath) {
  try {
    return fs
      .readdirSync(topicPath)
      .filter((d) => !isSpecialFolder(d) && isDir(path.join(topicPath, d)))
      .sort();
  } catch {
    return [];
  }
}

// get next problem number for a topic
function getNextProblemNumber(topicPath) {
  try {
    const dirs = fs.readdirSync(topicPath).filter((d) => isDir(path.join(topicPath, d)));
    const nums = dirs.map((d) => parseInt(d.split('_')[0], 10)).filter((n) => !isNaN(n));
    if (nums.length === 0) return '001';
    const max = Math.max(...nums);
    return String(max + 1).padStart(3, '0');
  } catch {
    return '001';
  }
}

// get next topic number for auto-increment (e.g., "01_Arrays", "02_Strings" → "03")
function getNextTopicNumber(root) {
  try {
    const dirs = fs.readdirSync(root).filter((d) => !isSpecialFolder(d) && isDir(path.join(root, d)));
    const nums = dirs
      .map((d) => parseInt(d.split('_')[0], 10))
      .filter((n) => !isNaN(n));
    if (nums.length === 0) return '01';
    const max = Math.max(...nums);
    return String(max + 1).padStart(2, '0');
  } catch (e) {
    console.warn('[workspace] cannot read root for topic numbering:', e.message);
    return '01';
  }
}

/**
 * Discover topic folders that contain at least one problem.
 * Filters out empty topics.
 *
 * @param {string} root
 * @returns {string[]} sorted topic names with problems
 */
function discoverTopicsWithProblems(root) {
  try {
    const dirs = fs
      .readdirSync(root)
      .filter((d) => !isSpecialFolder(d))
      .filter((d) => isDir(path.join(root, d)));
    return dirs
      .filter((topic) => scanProblemsInTopic(path.join(root, topic)).length > 0)
      .sort();
  } catch (e) {
    console.warn('[workspace] cannot read workspace for topic scan:', e.message);
    return [];
  }
}

// scan all problems across all topics - returns QuickPick items
function scanProblems(root) {
  const items = [];
  try {
    const topicDirs = fs
      .readdirSync(root)
      .filter((d) => !isSpecialFolder(d))
      .filter((d) => isDir(path.join(root, d)));
    for (const topic of topicDirs) {
      const topicPath = path.join(root, topic);
      const problems = scanProblemsInTopic(topicPath);
      for (const prob of problems) {
        items.push({
          label: `$(file-directory)  ${prob}`,
          description: topic,
          fullPath: path.join(topicPath, prob),
        });
      }
    }
  } catch (e) {
    vscode.window.showErrorMessage(`Grindstone: Cannot read workspace: ${e.message}`);
  }
  return items;
}

module.exports = {
  getWorkspaceRoot,
  isValidDsaWorkspace,
  discoverTopics,
  discoverTopicsWithProblems,
  scanProblems,
  scanProblemsInTopic,
  parseProblemNumber,
  getNextProblemNumber,
  getNextTopicNumber,
};
