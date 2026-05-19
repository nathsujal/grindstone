'use strict';

const vscode = require('vscode');
const path = require('path');
const { getWorkspaceRoot, scanProblemsInTopic, discoverTopicsWithProblems } = require('../utils/workspace');
const { exists, isDir } = require('../utils/fs-utils');
const { showProblemPicker, showTopicPickerWithCount } = require('../ui/picker');
const { openLayout } = require('../ui/layout');

// open problem via QuickPick — two-step: topic → problem
async function cmdOpenProblem() {
  try {
    const root = getWorkspaceRoot();
    if (!root) return;

    // Step 1 — pick topic (only topics with problems, with counts)
    const topics = discoverTopicsWithProblems(root);
    const topicItems = topics.map((t) => ({
      topic: t,
      count: scanProblemsInTopic(path.join(root, t)).length,
    }));
    const topic = await showTopicPickerWithCount(topicItems);
    if (!topic) return;

    // Step 2 — pick problem within topic
    const topicPath = path.join(root, topic);
    const problems = scanProblemsInTopic(topicPath);
    const items = problems.map((p) => ({
      label: `$(file-directory)  ${p}`,
      description: topic,
      fullPath: path.join(topicPath, p),
    }));

    const picked = await showProblemPicker(items);
    if (!picked) return;

    await openLayout(picked.fullPath);
  } catch (err) {
    vscode.window.showErrorMessage(`Grindstone error: ${err.message}`);
    console.error('[problem-picker] error:', err.message, err.stack);
  }
}

// open problem from context menu (path argument)
async function cmdOpenProblemPath(problemPath) {
  try {
    if (!problemPath) {
      vscode.window.showErrorMessage('Grindstone: no path provided.');
      return;
    }
    const root = getWorkspaceRoot();
    if (!root) return;

    const resolved = path.isAbsolute(problemPath) ? problemPath : path.join(root, problemPath);
    if (!exists(resolved) || !isDir(resolved)) {
      vscode.window.showErrorMessage(`Grindstone: Invalid path "${problemPath}"`);
      return;
    }

    // Validate it's actually a problem folder, not a topic or random dir
    const rel = path.relative(root, resolved);
    const parts = rel.split(path.sep);
    if (parts.length !== 2 || !/^\d+_/.test(parts[1])) {
      vscode.window.showErrorMessage(
        `Grindstone: "${path.basename(resolved)}" is not a problem folder. Select a folder like 01_Arrays/001_two_sum.`,
      );
      return;
    }

    await openLayout(resolved);
  } catch (err) {
    vscode.window.showErrorMessage(`Grindstone error: ${err.message}`);
    console.error('[problem-picker] error:', err.message, err.stack);
  }
}

module.exports = { cmdOpenProblem, cmdOpenProblemPath };
