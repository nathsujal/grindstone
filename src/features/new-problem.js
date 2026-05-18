'use strict';

const vscode = require('vscode');
const path   = require('path');
const fs     = require('fs');

const { getWorkspaceRoot, discoverTopics } = require('../utils/workspace');
const { writeTestCasesToProblemMd, syncTestCasesToInput } = require('../utils/testcase-sync');
const { getTrackerPath }   = require('../utils/tracker');
const { onProblemCreated } = require('../services/link-index');
const { fetchLeetCodeProblem } = require('../services/leetcode');
const {
  buildProblemMd,
  buildPythonSolution,
  buildCppSolution,
  buildRustSolution,
} = require('../utils/lc-mapper');
const { openLayout } = require('../ui/layout');

// ─────────────────────────────────────────────────────────────────
// Main command — Cmd+Shift+N
// ─────────────────────────────────────────────────────────────────
async function cmdNewProblem() {
  try {
    const root = getWorkspaceRoot();
    if (!root) return;

    // ── Step 1: Pick topic ──────────────────────────────────────
    // Returns a plain string e.g. '01_Arrays', or null if cancelled
    const topic = await pickTopic(root);
    if (!topic) return;

    // ── Step 2: Paste LC URL ────────────────────────────────────
    const url = await vscode.window.showInputBox({
      title:          'New Problem — Step 2 of 3',
      prompt:         'Paste LeetCode problem URL',
      placeHolder:    'https://leetcode.com/problems/two-sum/',
      ignoreFocusOut: true,
      validateInput:  (val) => {
        if (!val?.trim()) return 'URL is required';
        if (!val.includes('leetcode.com/problems/')) {
          return 'Must be a leetcode.com/problems/... URL';
        }
        return null;
      },
    });
    if (!url) return;

    // ── Step 3: Fetch from LC GraphQL API ───────────────────────
    let lc;
    await vscode.window.withProgress(
      {
        location:    vscode.ProgressLocation.Notification,
        title:       'DSA: Fetching from LeetCode...',
        cancellable: false,
      },
      async () => {
        lc = await fetchLeetCodeProblem(url.trim());
      }
    );

    if (!lc) {
      vscode.window.showErrorMessage('GrindStone: Failed to fetch problem data.');
      return;
    }

    // ── Step 4: Preview + confirm ───────────────────────────────
    // topic is now correctly in scope — defined in Step 1
    const confirmed = await previewAndConfirm(lc, topic);
    if (!confirmed) return;

    // ── Step 5: Build folder path ───────────────────────────────
    const topicPath  = path.join(root, topic);   // topic is a string — correct
    const numStr     = await getNextNumber(topicPath);
    const folderName = buildFolderName(numStr, lc.titleSlug);
    const problemDir = path.join(topicPath, folderName);

    if (fs.existsSync(problemDir)) {
      vscode.window.showErrorMessage(`GrindStone: Folder already exists: ${folderName}`);
      return;
    }

    // ── Step 6: Create all files ────────────────────────────────
    // Fixed arg order: (problemDir, root, lc, numStr, topicName)
    createProblemFiles(problemDir, root, lc, numStr, topic);

    // ── Step 7: Update tracker + index ─────────────────────────
    appendTrackerRow(root, topic, numStr, lc.title, lc.difficulty);

    const relPath = path.relative(root, problemDir).split(path.sep).join('/');
    onProblemCreated(root, relPath);

    // ── Step 8: Open layout ─────────────────────────────────────
    await openLayout(problemDir);

    vscode.window.showInformationMessage(
      `✓ Created: ${folderName} (LC #${lc.questionId})`
    );

  } catch (err) {
    vscode.window.showErrorMessage(`GrindStone New Problem: ${err.message}`);
    console.error('[new-problem]', err);
  }
}

// ─────────────────────────────────────────────────────────────────
// Step 1 — topic picker
// Returns plain string e.g. '01_Arrays', or null if cancelled.
// ─────────────────────────────────────────────────────────────────
async function pickTopic(root) {
  const topics = discoverTopics(root);
  if (topics.length === 0) {
    vscode.window.showErrorMessage('GrindStone: No topic folders found.');
    return null;
  }

  const items = topics.map(t => ({
    label:       `$(file-directory)  ${t}`,
    description: '',
    topic:       t,
  }));

  const picked = await vscode.window.showQuickPick(items, {
    title:       'New Problem — Step 1 of 3',
    placeHolder: 'Select topic folder',
  });

  // Return the raw topic string, not the QuickPick item object
  return picked?.topic ?? null;
}

// ─────────────────────────────────────────────────────────────────
// Step 4 — preview QuickPick before creating
// ─────────────────────────────────────────────────────────────────
async function previewAndConfirm(lc, topic) {
  const tags = (lc.topicTags ?? []).map(t => t.name).join(', ') || '—';

  const items = [
    {
      label:       `$(check)  Create this problem`,
      description: `LC #${lc.questionId} — ${lc.difficulty}`,
      detail: [
        `Title:    ${lc.title}`,
        `Topic:    ${topic}`,
        `Tags:     ${tags}`,
        `Examples: ${lc.exampleTestcases ? 'yes → input.txt' : 'none'}`,
        `Snippets: ${(lc.codeSnippets ?? []).map(s => s.langSlug).join(', ')}`,
      ].join('   |   '),
      action: 'confirm',
    },
    {
      label:       `$(close)  Cancel`,
      description: 'Go back',
      action:      'cancel',
    },
  ];

  const picked = await vscode.window.showQuickPick(items, {
    title:              'New Problem — Step 3 of 3 — Preview',
    placeHolder:        'Confirm problem details',
    matchOnDescription: false,
    matchOnDetail:      false,
  });

  return picked?.action === 'confirm';
}

// ─────────────────────────────────────────────────────────────────
// Step 6 — create all files in problem folder
// Args: (problemDir, root, lc, numStr, topicName)
// ─────────────────────────────────────────────────────────────────
function createProblemFiles(problemDir, root, lc, numStr, topicName) {
  fs.mkdirSync(problemDir, { recursive: true });

  try {
    // PROBLEM.md — built from LC data
    fs.writeFileSync(
      path.join(problemDir, 'PROBLEM.md'),
      buildProblemMd(lc, numStr, topicName),
      'utf8'
    );

    // Fill ## Test Cases section with LC example testcases
    if (lc.exampleTestcases) {
      writeTestCasesToProblemMd(problemDir, lc.sampleTestCase);
    }

    // Solution files — LC snippets + header
    fs.writeFileSync(path.join(problemDir, 'solution.py'),  buildPythonSolution(lc, numStr), 'utf8');
    fs.writeFileSync(path.join(problemDir, 'solution.cpp'), buildCppSolution(lc, numStr),    'utf8');
    fs.writeFileSync(path.join(problemDir, 'solution.rs'),  buildRustSolution(lc, numStr),   'utf8');

    // Sync testcases → root/input.txt immediately
    syncTestCasesToInput(root, problemDir);

    // Ensure root/output.txt exists
    const globalOutputPath = path.join(root, 'output.txt');
    if (!fs.existsSync(globalOutputPath)) {
      fs.writeFileSync(globalOutputPath, '', 'utf8');
    }

    console.log(`[new-problem] created ${problemDir}`);
  } catch (err) {
    // Rollback: delete the half-created folder
    try {
      fs.rmSync(problemDir, { recursive: true, force: true });
      console.log(`[new-problem] rolled back ${problemDir}`);
    } catch (rollbackErr) {
      console.error(`[new-problem] rollback failed: ${rollbackErr.message}`);
    }
    throw err;  // Re-throw so caller can show error notification
  }
}

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

async function getNextNumber(topicPath) {
  const isDir = p => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };
  try {
    const dirs = fs.readdirSync(topicPath).filter(d => isDir(path.join(topicPath, d)));
    const nums = dirs
      .map(d => parseInt(d.split('_')[0], 10))
      .filter(n => !isNaN(n));
    const max = nums.length > 0 ? Math.max(...nums) : 0;
    return String(max + 1).padStart(3, '0');
  } catch {
    return '001';
  }
}

function sanitizeFolderName(slug) {
  // Replace unsafe chars with underscore
  const safe = slug.replace(/[^a-zA-Z0-9_-]/g, '_');
  // Collapse multiple underscores
  const collapsed = safe.replace(/_+/g, '_');
  // Trim leading/trailing underscores
  return collapsed.replace(/^_+|_+$/g, '') || 'untitled';
}

function buildFolderName(numStr, titleSlug) {
  // LC titleSlug is kebab-case e.g. 'two-sum' → snake_case '002_two_sum'
  const safeName = sanitizeFolderName(titleSlug.replace(/-/g, '_'));
  return `${numStr}_${safeName}`;
}

function appendTrackerRow(root, topic, numStr, title, difficulty) {
  const trackerPath = getTrackerPath(root);
  if (!fs.existsSync(trackerPath)) {
    console.warn('[new-problem] TRACKER.md not found — skipping tracker update');
    return;
  }
  const snakeName = title
    .toLowerCase()
    .replace(/[|\\]/g, '')        // remove chars that break markdown tables
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
  const today     = new Date().toISOString().split('T')[0];
  const row       = `| ${topic} | ${numStr} | ${snakeName} | ${difficulty} | Todo | — | ${today} |`;
  fs.appendFileSync(trackerPath, '\n' + row, 'utf8');
}

module.exports = { cmdNewProblem };