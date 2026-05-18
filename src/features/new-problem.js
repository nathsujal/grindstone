'use strict';

const vscode = require('vscode');
const path = require('path');

const { getWorkspaceRoot, discoverTopics } = require('../utils/workspace');
const { fetchLeetCodeProblem } = require('../services/leetcode');
const { createProblem } = require('../services/problem-creator');
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
      vscode.window.showErrorMessage('GrindStone: Folder already exists.');
      return;
    }

    await openLayout(result.problemDir);
    vscode.window.showInformationMessage(`✓ Created: ${path.basename(result.problemDir)} (LC #${problemData.questionId})`);
  } catch (err) {
    vscode.window.showErrorMessage(`GrindStone New Problem: ${err.message}`);
    console.error('[new-problem]', err);
  }
}

// Step 1 — topic picker
// Returns plain string e.g. '01_Arrays', or null if cancelled.
async function pickTopic(root) {
  const topics = discoverTopics(root);
  if (topics.length === 0) {
    vscode.window.showErrorMessage('GrindStone: No topic folders found.');
    return null;
  }

  const items = topics.map((t) => ({
    label: `$(file-directory)  ${t}`,
    description: '',
    topic: t,
  }));

  const picked = await vscode.window.showQuickPick(items, {
    title: 'New Problem — Step 1 of 3',
    placeHolder: 'Select topic folder',
  });

  return picked?.topic ?? null;
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
    vscode.window.showErrorMessage('GrindStone: Failed to fetch problem data.');
  }
  return problemData;
}

// Step 4 — preview QuickPick before creating
async function previewAndConfirm(problemData, topic) {
  const tags = (problemData.topicTags ?? []).map((t) => t.name).join(', ') || '—';

  const items = [
    {
      label: '$(check)  Create this problem',
      description: `LC #${problemData.questionId} — ${problemData.difficulty}`,
      detail: [
        `Title:    ${problemData.title}`,
        `Topic:    ${topic}`,
        `Tags:     ${tags}`,
        `Examples: ${problemData.exampleTestcases ? 'yes → input.txt' : 'none'}`,
        `Snippets: ${(problemData.codeSnippets ?? []).map((s) => s.langSlug).join(', ')}`,
      ].join('   |   '),
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
