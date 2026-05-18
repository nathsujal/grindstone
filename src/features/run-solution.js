'use strict';

const vscode = require('vscode');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const cp = require('child_process');
const fs = require('fs');
const { syncTestCasesToInput } = require('../utils/testcase-sync');
const { getWorkspaceRoot, discoverTopics, scanProblemsInTopic } = require('../utils/workspace');
const { getOpenProblemDir } = require('../utils/tab-utils');

// Language runner config
//
// build(file, tmpDir)          → shell command to compile (null = no compile step)
// run(file, input, output, tmpDir) → shell command to execute
//
// Both pipe stdin from input.txt and stdout+stderr to output.txt.
// 2>&1 merges stderr into stdout so compile errors appear in output.txt.
const RUNNERS = {
  '.py': {
    label: 'Python — solution.py',
    build: null,
    run: (file, inputFile, outputFile) =>
      `python3 "${file}" < "${inputFile}" > "${outputFile}" 2>&1`,
  },
  '.cpp': {
    label: 'C++ — solution.cpp',
    build: (file, tmpDir) =>
      `g++ -std=c++17 -O2 -Wall "${file}" -o "${path.join(tmpDir, 'sol_cpp')}" 2>&1`,
    run: (_file, inputFile, outputFile, tmpDir) =>
      `"${path.join(tmpDir, 'sol_cpp')}" < "${inputFile}" > "${outputFile}" 2>&1`,
  },
  '.rs': {
    label: 'Rust — solution.rs',
    build: (file, tmpDir) => `rustc "${file}" -o "${path.join(tmpDir, 'sol_rs')}" 2>&1`,
    run: (_file, inputFile, outputFile, tmpDir) =>
      `"${path.join(tmpDir, 'sol_rs')}" < "${inputFile}" > "${outputFile}" 2>&1`,
  },
};

const SOLUTION_FILES = ['solution.py', 'solution.cpp', 'solution.rs'];

const FILE_ICONS = {
  '.py': '$(symbol-misc)',
  '.cpp': '$(symbol-class)',
  '.rs': '$(symbol-enum)',
};

const COMPILE_TIMEOUT_MS = 30000; // 30 seconds
const RUN_TIMEOUT_MS = 15000;     // 15 seconds

// Main command — Cmd+Shift+R
async function cmdRunSolution() {
  try {
    const root = getWorkspaceRoot();
    if (!root) return;

    // Detect whether a problem is already open in the layout
    const openProblemDir = getOpenProblemDir(root);

    let problemDir;

    if (openProblemDir) {
      // Flow A — problem open → skip topic + problem picker
      problemDir = openProblemDir;
    } else {
      // Flow B — nothing open → full 3-step picker
      problemDir = await pickProblemDir(root);
      if (!problemDir) return;
    }

    // Pick which solution file to run
    const solutionFile = await pickSolutionFile(problemDir);
    if (!solutionFile) return;

    // Run
    await runFile(root, problemDir, solutionFile);
  } catch (err) {
    vscode.window.showErrorMessage(`GrindStone Run: ${err.message}`);
    console.error('[run-solution]', err);
  }
}

// Flow B — 2-step picker: topic → problem
// Returns absolute problem folder path, or null if cancelled.
async function pickProblemDir(root) {
  // Step 1 of 3 — topic
  const topics = discoverTopics(root);
  if (topics.length === 0) {
    vscode.window.showErrorMessage('GrindStone Run: No topics found.');
    return null;
  }

  const topicItems = topics.map((t) => ({
    label: `$(file-directory)  ${t}`,
    description: '',
    topic: t,
  }));

  const pickedTopic = await vscode.window.showQuickPick(topicItems, {
    placeHolder: 'Step 1 of 3 — Select topic',
    matchOnDescription: false,
  });
  if (!pickedTopic) return null;

  // Step 2 of 3 — problem
  const topicPath = path.join(root, pickedTopic.topic);
  const problems = scanProblemsInTopic(topicPath);

  if (problems.length === 0) {
    vscode.window.showErrorMessage(`GrindStone Run: No problems found in ${pickedTopic.topic}`);
    return null;
  }

  const problemItems = problems.map((p) => ({
    label: `$(file-directory)  ${p}`,
    description: pickedTopic.topic,
    prob: p,
  }));

  const pickedProblem = await vscode.window.showQuickPick(problemItems, {
    placeHolder: 'Step 2 of 3 — Select problem',
    matchOnDescription: true,
  });
  if (!pickedProblem) return null;

  return path.join(topicPath, pickedProblem.prob);
}

// Pick solution file from the problem folder.
// Only shows files that actually exist.
// Skips picker entirely if only one file exists.
async function pickSolutionFile(problemDir) {
  const existing = SOLUTION_FILES.filter((f) => fs.existsSync(path.join(problemDir, f)));

  if (existing.length === 0) {
    vscode.window.showErrorMessage(
      `GrindStone Run: No solution files found in ${path.basename(problemDir)}`,
    );
    return null;
  }

  // Single file — no need to ask
  if (existing.length === 1) return existing[0];

  const fileItems = existing.map((f) => ({
    label: `${FILE_ICONS[path.extname(f)] ?? '$(file)'}  ${f}`,
    description: path.basename(problemDir),
    file: f,
  }));

  const picked = await vscode.window.showQuickPick(fileItems, {
    placeHolder: 'Step 3 of 3 — Select solution file to run',
  });

  return picked?.file ?? null;
}

// Run a solution file.
//
// Steps:
//   1. Sync PROBLEM.md test cases → root/input.txt
//   2. Compile (C++ / Rust only) — errors → output.txt + notification
//   3. Execute — stdin from input.txt, stdout+stderr → output.txt
//   4. Reveal output.txt in Col 3
//   5. Success / error notification
async function runFile(root, problemDir, fileName) {
  // 1. Sync test cases → input.txt before every run
  syncTestCasesToInput(root, problemDir);

  const ext = path.extname(fileName); // '.py' | '.cpp' | '.rs'
  const runner = RUNNERS[ext];

  if (!runner) {
    vscode.window.showErrorMessage(`GrindStone Run: No runner configured for "${ext}" files`);
    return;
  }

  // Resolve paths
  const absFile = path.join(problemDir, fileName);
  const inputFile = path.join(root, 'input.txt');
  const outputFile = path.join(root, 'output.txt');

  // Workspace-specific temp dir to avoid conflicts between workspaces
  const workspaceHash = crypto.createHash('md5').update(root).digest('hex').slice(0, 8);
  const tmpDir = path.join(os.tmpdir(), `grindstone-${workspaceHash}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  // Validate compiler exists for compiled languages
  if (ext === '.cpp') {
    try {
      cp.execSync('g++ --version', { stdio: 'ignore' });
    } catch {
      throw new Error('g++ compiler not found. Install Xcode Command Line Tools (Mac) or g++ (Linux).');
    }
  }
  if (ext === '.rs') {
    try {
      cp.execSync('rustc --version', { stdio: 'ignore' });
    } catch {
      throw new Error('rustc compiler not found. Install via rustup: https://rustup.rs');
    }
  }

  // Validate input file exists
  if (!fs.existsSync(inputFile)) {
    throw new Error(`Input file not found: ${path.basename(inputFile)}`);
  }

  // Ensure input.txt exists (may be empty if no test cases)
  if (!fs.existsSync(inputFile)) fs.writeFileSync(inputFile, '', 'utf8');

  // Status bar spinner
  const statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusItem.text = `$(sync~spin)  Running ${fileName}...`;
  statusItem.tooltip = `DSA: running ${path.basename(problemDir)}/${fileName}`;
  statusItem.show();

  try {
    // 2. Compile step (C++ and Rust only)
    if (runner.build) {
      const buildCmd = runner.build(absFile, tmpDir);
      console.log('[run-solution] compile:', buildCmd);

      const buildResult = await execCommand(buildCmd, problemDir, COMPILE_TIMEOUT_MS);

      if (buildResult.exitCode !== 0) {
        fs.writeFileSync(outputFile, `=== COMPILE ERROR ===\n\n${buildResult.stdout}\n`, 'utf8');
        await revealOutput(outputFile);
        vscode.window.showErrorMessage(
          `GrindStone Run: ${fileName} — compile failed. See output.txt`,
        );
        return;
      }

      console.log('[run-solution] compile OK');
    }

    // 3. Run step
    const runCmd = runner.run(absFile, inputFile, outputFile, tmpDir);
    console.log('[run-solution] run:', runCmd);

    const runResult = await execCommand(runCmd, problemDir, RUN_TIMEOUT_MS);

    // 4. Reveal output.txt
    await revealOutput(outputFile);

    // 5. Notification
    if (runResult.exitCode !== 0) {
      vscode.window.showWarningMessage(
        `GrindStone Run: ${fileName} exited with code ${runResult.exitCode} — check output.txt`,
      );
    } else {
      vscode.window.showInformationMessage(
        `GrindStone Run: ${fileName} ✓ — output written to output.txt`,
      );
    }
  } finally {
    statusItem.dispose();
    // Clean up workspace-specific temp dir
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (e) {
      console.error('[run-solution] temp cleanup failed:', e.message);
    }
  }
}

// Reveal output.txt in Col 3 without stealing focus from the solution file.
async function revealOutput(outputFile) {
  try {
    await vscode.window.showTextDocument(vscode.Uri.file(outputFile), {
      viewColumn: vscode.ViewColumn.Three,
      preview: false,
      preserveFocus: true,
    });
  } catch (e) {
    console.error('[run-solution] revealOutput failed:', e.message);
  }
}

// Shell executor — wraps child_process.exec in a Promise with timeout.
function execCommand(cmd, cwd, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = cp.exec(cmd, { cwd }, (err, stdout, stderr) => {
      resolve({
        exitCode: err?.code ?? 0,
        stdout: (stdout ?? '') + (stderr ?? ''),
      });
    });

    if (timeoutMs) {
      child.on('timeout', () => {
        child.kill();
        reject(new Error(`Command timed out after ${timeoutMs / 1000}s: ${cmd}`));
      });
      child.setTimeout(timeoutMs);
    }
  });
}

module.exports = { cmdRunSolution };
