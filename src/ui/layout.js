'use strict';

const vscode    = require('vscode');
const path      = require('path');
const constants = require('../constants');
const { exists, writeFile }          = require('../utils/fs-utils');
const { getWorkspaceRoot }           = require('../utils/workspace');
const { sleep, pollUntil, showDoc }  = require('../utils/async.js');
const { syncTestCasesToInput }       = require('../utils/testcase-sync.js');


// closeAllTabsHard
// Close every open tab using the TabGroups API.
// Falls back to workbench command if tabGroups.close throws.
async function closeAllTabsHard() {
  const groups = [...vscode.window.tabGroups.all];
  if (groups.length === 0) return;

  const tabs = groups.flatMap(g => [...g.tabs]);
  if (tabs.length === 0) return;

  try {
    await vscode.window.tabGroups.close(tabs, /* preserveFocus */ false);
  } catch (_) {
    // fallback — may leave phantom empty groups, clearLayout handles that
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  }

  await sleep(150);
}


// clearLayout
// Save all files, close all tabs, collapse to a single empty group.
async function clearLayout() {
  try {
    await vscode.commands.executeCommand('workbench.action.files.saveAll');
    await sleep(100);

    await closeAllTabsHard();

    // Prevent VS Code from redistributing pane sizes on next layout call
    await vscode.workspace
      .getConfiguration('workbench.editor')
      .update('splitSizing', 'fixed', vscode.ConfigurationTarget.Global);

    // Collapse to single group
    await vscode.commands.executeCommand(
      'vscode.setEditorLayout',
      { orientation: 0, groups: [{}] }
    );

    // Wait until we genuinely have 1 empty group
    const resetOk = await pollUntil(
      () => {
        const groups = vscode.window.tabGroups.all;
        return groups.length === 1 && groups[0].tabs.length === 0;
      },
      { interval: 80, timeout: 3000 }
    );

    if (!resetOk) {
      // Nuclear fallback
      await closeAllTabsHard();
      await vscode.commands.executeCommand(
        'vscode.setEditorLayout',
        { orientation: 0, groups: [{}] }
      );
      await sleep(400);
    }
  } catch (err) {
    console.error('[layout] clearLayout error:', err.message, err.stack);
  }
}

// openLayout
//
// Opens the 4-pane DSA workbench for a given problem folder.
//
// TARGET LAYOUT:
//
//  ┌──────────────────────┬───────────────────────────────────┐
//  │                      │  [solution.py][.cpp][.rs] ← tabs  │
//  │     PROBLEM.md       │                                   │
//  │     (Col 1 top)      │     active solution file          │
//  │                      │     (Col 4)                       │
//  ├───────────┬──────────┤                                   │
//  │ input.txt │output.txt│                                   │
//  │ (Col 2)   │ (Col 3)  │                                   │
//  └───────────┴──────────┴───────────────────────────────────┘
//
//  input.txt + output.txt live at DSA/ root (global, shared).
//  Test cases are synced from PROBLEM.md → input.txt on every open.
//
// @param {string} problemDir  absolute path to problem folder
//
async function openLayout(problemDir) {
  const root = getWorkspaceRoot();
  if (!root) return;

  // 1. Sync test cases → global input.txt
  // Reads ## Test Cases section from PROBLEM.md, overwrites root/input.txt
  syncTestCasesToInput(root, problemDir);

  // 2. Resolve file paths
  // input + output live at root, everything else in problem folder
  const fp = {
    problem : path.join(problemDir, constants.FILE_PROBLEM),
    py      : path.join(problemDir, 'solution.py'),
    cpp     : path.join(problemDir, 'solution.cpp'),
    rs      : path.join(problemDir, 'solution.rs'),
    input   : path.join(root, constants.FILE_INPUT),
    output  : path.join(root, constants.FILE_OUTPUT),
  };

  // 3. Ensure all files exist (create empty if missing)
  for (const [key, filePath] of Object.entries(fp)) {
    if (!exists(filePath)) {
      try {
        writeFile(filePath, '');
      } catch (e) {
        vscode.window.showErrorMessage(
          `DSA Layout: cannot create ${path.basename(filePath)}: ${e.message}`
        );
        // Don't abort — missing solution file is non-fatal
      }
    }
  }

  // 4. Build VS Code URIs
  const uri = {};
  for (const [k, p] of Object.entries(fp)) {
    uri[k] = vscode.Uri.file(p);
  }

  // 5. Hard reset — close all editors
  await clearLayout();

  // 6. Declare 4-pane grid layout
  //
  //  orientation 0 = horizontal split (left | right)
  //  orientation 1 = vertical split   (top / bottom)
  //
  //  Left side  (size 2): PROBLEM.md on top, input+output row on bottom
  //  Right side (size 4): single pane for solution tabs
  //
  await vscode.commands.executeCommand('vscode.setEditorLayout', {
    orientation: 0,
    groups: [
      {
        // Left column
        orientation: 1,
        size: 2,
        groups: [
          { size: 2 },    // Col 1 — PROBLEM.md (top)
          {
            // Bottom row inside left column
            orientation: 0,
            size: 2,
            groups: [
              { size: 1 },  // Col 2 — input.txt  (bottom-left)
              { size: 1 },  // Col 3 — output.txt (bottom-right)
            ]
          }
        ]
      },
      { size: 4 },          // Col 4 — solution files as tabs (right)
    ]
  });

  // 7. Wait until VS Code reports exactly 4 groups
  const layoutOk = await pollUntil(
    () => vscode.window.tabGroups.all.length === 4,
    { interval: 80, timeout: 4000 }
  );

  if (!layoutOk) {
    vscode.window.showErrorMessage(
      'DSA Layout: timed out waiting for layout. Try again.'
    );
    return;
  }

  // Extra buffer — VS Code sometimes hasn't finished wiring
  // ViewColumn → group mapping even after tabGroups reports 4 groups
  await sleep(150);

  // 8. Open files into their groups

  // Col 1 (top-left) — PROBLEM.md
  await showDoc(uri.problem, vscode.ViewColumn.One);
  await sleep(80);

  // Col 2 (bottom-left) — input.txt
  await showDoc(uri.input, vscode.ViewColumn.Two);
  await sleep(80);

  // Col 3 (bottom-right) — output.txt
  await showDoc(uri.output, vscode.ViewColumn.Three);
  await sleep(80);

  // Col 4 (right, full height) — solution files as tabs
  // Open cpp + rs first so py ends up as the active (frontmost) tab
  await showDoc(uri.cpp, vscode.ViewColumn.Four);
  await sleep(60);
  await showDoc(uri.rs,  vscode.ViewColumn.Four);
  await sleep(60);
  await showDoc(uri.py,  vscode.ViewColumn.Four);  // ← active tab
  await sleep(80);

  // 9. Return focus to PROBLEM.md
  await showDoc(uri.problem, vscode.ViewColumn.One);

  vscode.window.showInformationMessage(
    `✓ DSA Layout: ${path.basename(problemDir)}`
  );
}

module.exports = { clearLayout, openLayout, closeAllTabsHard };