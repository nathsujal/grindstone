'use strict';

const fs = require('fs');
const path = require('path');
const vscode = require('vscode');

const { getWorkspaceRoot, discoverTopics, getNextTopicNumber } = require('../utils/workspace');
const { fetchLeetCodeProblem } = require('../services/leetcode');
const { createProblem, capitalizeWords } = require('../services/problem-creator');
const { openLayout } = require('../ui/layout');

// Main command — Cmd+Shift+N
async function cmdNewProblem() {
  try {
    const root = getWorkspaceRoot();
    if (!root) return;

    const topic = await pickTopic(root);
    if (!topic) return;

    const url = await promptLeetCodeUrl();
    if (!url) return;

    const problemData = await fetchWithProgress(url);
    if (!problemData) return;

    const confirmed = await previewAndConfirm(problemData, topic);
    if (!confirmed) return;

    const result = createProblem(root, topic, problemData);
    if (!result) {
      vscode.window.showErrorMessage(`Grindstone: ${topic} already exists.`);
      return;
    }

    await openLayout(result.problemDir);
    vscode.window.showInformationMessage(`✓ Created: ${path.basename(result.problemDir)} (LC #${problemData.questionId})`);
  } catch (err) {
    vscode.window.showErrorMessage(`Grindstone New Problem: ${err.message}`);
    console.error('[new-problem]', err);
  }
}

// Step 1 — topic picker with "Create new topic..." option
// Returns plain string e.g. '01_Arrays', or null if cancelled.
async function pickTopic(root) {
  const topics = discoverTopics(root);

  const items = [
    {
      label: '$(new-folder)  Create new topic...',
      description: 'Create a new topic folder',
      action: 'create',
    },
    ...topics.map((t) => ({
      label: `$(file-directory)  ${t}`,
      description: '',
      action: 'select',
      topic: t,
    })),
  ];

  const picked = await vscode.window.showQuickPick(items, {
    title: 'New Problem — Step 1 of 3',
    placeHolder: 'Select topic or create new',
  });

  if (!picked) return null;

  if (picked.action === 'create') {
    const newTopic = await createNewTopic(root);
    if (newTopic) {
      vscode.window.showInformationMessage(`✓ Created topic: ${newTopic}`);
    }
    return newTopic;
  }

  return picked.topic ?? null;
}

/**
 * Prompt user to create a new topic folder.
 *
 * @param {string} root
 * @returns {Promise<string|null>} topic name or null if cancelled
 */
async function createNewTopic(root) {
  const name = await vscode.window.showInputBox({
    title: 'New Problem — Create Topic',
    prompt: 'Enter topic name (e.g., "Dynamic Array")',
    placeHolder: 'Dynamic Array',
    ignoreFocusOut: true,
    validateInput: (val) => {
      if (!val?.trim()) return 'Topic name is required';
      if (val.trim().length < 2) return 'Topic name too short (min 2 chars)';
      return null;
    },
  });

  if (!name) return null;

  const sanitizedName = capitalizeWords(name);
  const nextNum = getNextTopicNumber(root);
  const topicName = `${nextNum}_${sanitizedName}`;
  const topicPath = path.join(root, topicName);

  if (fs.existsSync(topicPath)) {
    vscode.window.showErrorMessage(`GrindStone: Topic "${topicName}" already exists.`);
    return null;
  }

  fs.mkdirSync(topicPath, { recursive: true });

  return topicName;
}

// Step 2 — prompt user for LeetCode URL with validation
/**
 * Prompt user for LeetCode problem URL with validation.
 *
 * @returns {Promise<string|null>}
 */
async function promptLeetCodeUrl() {
  return vscode.window.showInputBox({
    title: 'New Problem — Step 2 of 3',
    prompt: 'Paste LeetCode problem URL',
    placeHolder: 'https://leetcode.com/problems/two-sum/',
    ignoreFocusOut: true,
    validateInput: (val) => {
      if (!val?.trim()) return 'URL is required';
      if (!val.includes('leetcode.com/problems/')) {
        return 'Must be a leetcode.com/problems/... URL';
      }
      return null;
    },
  });
}

// Step 3 — fetch problem data with progress indicator
/**
 * Fetch problem data from LeetCode with progress indicator.
 *
 * @param {string} url
 * @returns {Promise<Object|null>}
 */
async function fetchWithProgress(url) {
  let problemData;
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'DSA: Fetching from LeetCode...',
      cancellable: false,
    },
    async () => {
      problemData = await fetchLeetCodeProblem(url.trim());
    },
  );

  if (!problemData) {
    vscode.window.showErrorMessage('Grindstone: Failed to fetch problem data.');
  }
  return problemData;
}

// Step 4 — preview QuickPick before creating
async function previewAndConfirm(problemData, topic) {
  const tags = (problemData.topicTags ?? []).map((t) => t.name).join(', ') || '—';

  const items = [
    {
      label: `$(check)  Create — ${problemData.title}`,
      description: `LC #${problemData.questionId}  ·  ${problemData.difficulty}  ·  ${topic}`,
      detail: `Tags: ${tags}`,
      action: 'confirm',
    },
    {
      label: '$(close)  Cancel',
      description: 'Go back',
      action: 'cancel',
    },
  ];

  const picked = await vscode.window.showQuickPick(items, {
    title: 'New Problem — Step 3 of 3 — Preview',
    placeHolder: 'Confirm problem details',
    matchOnDescription: false,
    matchOnDetail: false,
  });

  return picked?.action === 'confirm';
}

module.exports = { cmdNewProblem };
