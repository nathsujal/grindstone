'use strict';

const vscode = require('vscode');
const path = require('path');
const { getWorkspaceRoot, discoverTopics, scanProblemsInTopic, parseProblemNumber } = require('../utils/workspace');
const { rmDir, rename, cleanupMarkdownReferences, exists } = require('../utils/fs-utils');
const { getTrackerPath, strikeTrackerRow, strikeAllTopicRows } = require('../utils/tracker');
const { showTopicPicker, showDeletePicker, confirmDelete } = require('../ui/picker');
const { clearLayout } = require('../ui/layout');
const { openLayout } = require('../ui/layout');
const { showDoc, sleep } = require('../utils/async');
const { onProblemRenamed, onProblemDeleted, getReferencingFiles } = require('../services/link-index');
const { updateLinksAcrossWorkspace, updateTrackerRow } = require('../utils/md-updater');

// delete single problem + renumber remaining
async function deleteSingleProblem(root, topicName, topicPath, problemName) {
  const problemPath = path.join(topicPath, problemName);
  const deletedNum = parseProblemNumber(problemName);

  // 1: Snapshot open tabs BEFORE any changes
  const openTabPaths = vscode.window.tabGroups.all
    .flatMap(g => g.tabs)
    .map(t => t?.input?.uri?.fsPath)
    .filter(Boolean);


  const openProblemDir = openTabPaths
    .map(p => {
      // Walk up until we find a path that is a direct child of topicPath
      // e.g. /DSA/01_Arrays/002_sum/solution.py → /DSA/01_Arrays/002_sum
      const rel = path.relative(topicPath, p);
      if (rel.startsWith('..')) return null;          // not under this topic
      const parts = rel.split(path.sep);
      if (parts.length < 2) return null;              // it's NOTES.md etc, not a problem file
      return path.join(topicPath, parts[0]);          // the problem folder
    })
    .find(Boolean) || null;

  // 2: Remove deleted problem from index
  onProblemDeleted(root, path.relative(root, problemPath).split(path.sep).join('/'));

  // 3: Delete the folder
  rmDir(problemPath);

  // 4: Renumber remaining, build old -> new map
  const remaining = scanProblemsInTopic(topicPath);
  let counter = 1;
  const renamedProblems = [];
  const renameMap = new Map();

  for (const prob of remaining) {
    const oldNum = parseProblemNumber(prob);
    const newNumStr = String(counter).padStart(3, '0');

    if (oldNum !== counter) {
      const oldPath = path.join(topicPath, prob);
      const newName = prob.replace(/^\d+_/, newNumStr + '_');
      const newPath = path.join(topicPath, newName);

      renamedProblems.push({ oldPath, newPath });

      try {
        rename(oldPath, newPath);
        const probNameOnly = prob.replace(/^\d+_/, '');  // 'two_sum'
        
        /// Update .md file
        
        // 1. Fix all markdown links in workspace pointing to old path
        //    Uses index to only scan files that reference this problem.
        //    Falls back to full workspace scan if index has no entry yet.
        const oldRelPath = path.relative(root, oldPath).split(path.sep).join('/');
        const referencingFiles = getReferencingFiles(root, oldRelPath);
        updateLinksAcrossWorkspace(
          root,
          oldPath,
          newPath,
          referencingFiles.length > 0
            ? referencingFiles.map(f => path.join(root, f))
            : null    // null = full scan fallback
        );

        // 2. Fix number cell in TRACKER.md row for this problem
        updateTrackerRow(
          getTrackerPath(root),
          topicName,
          probNameOnly,
          newNumStr
        );

        // 3. Update in-memory index — move entry old → new
        onProblemRenamed(
          root,
          oldRelPath,
          path.relative(root, newPath).split(path.sep).join('/')
        );

        // 4. Track rename for layout reopen logic (Step 6 below)
        renameMap.set(oldPath, newPath);

      } catch (err) {
        vscode.window.showErrorMessage(`Failed to rename '${prob}' to '${newName}': ${err.message}`);
        console.error('[delete-problem] rename error:', err.message);
        break;
      }
    }
    counter++;
  }

  // 5: Strike tracker row + cleanup links to deleted problem
  if (deletedNum) {
    const trackerPath = getTrackerPath(root);
    strikeTrackerRow(trackerPath, topicName, String(deletedNum).padStart(3, '0'));
  }
  cleanupMarkdownReferences(root, topicName, problemName);

  // 6: Reopen layout if the open problem was renamed
  if (openProblemDir) {
    const wasDeleted = openProblemDir === problemPath;
    const renamedTo  = renameMap.get(openProblemDir);

    if (wasDeleted) {
      await clearLayout();
      vscode.window.showInformationMessage(
        `✓ Deleted: ${problemName} (was open — layout cleared)`
      );
    } else if (renamedTo) {
      await openLayout(renamedTo);
      vscode.window.showInformationMessage(
        `✓ Deleted: ${problemName} — reopened ${path.basename(renamedTo)}`
      );
    }
  }

  if (scanProblemsInTopic(topicPath).length === 0) {
    vscode.window.showWarningMessage(`Topic '${topicName}' is now empty.`);
  }
}

// delete entire topic + renumber remaining topics
async function deleteWholeTopic(root, topicName, topicPath) {

  // 1: Snapshot open tabs BEFORE any changes
  const openTabPaths = vscode.window.tabGroups.all
    .flatMap(g => g.tabs)
    .map(t => t?.input?.uri?.fsPath)
    .filter(Boolean);

  const openTopicDir = openTabPaths
    .map(p => {
      const rel = path.relative(root, p);
      if (rel.startsWith('..')) return null;
      const parts = rel.split(path.sep);
      if (parts.length < 1) return null;
      return path.join(root, parts[0]);   // top-level topic folder
    })
    .find(Boolean) || null;

  const openIsInsideDeletedTopic = openTopicDir === topicPath;

  const openProblemDir = !openIsInsideDeletedTopic
    ? openTabPaths
        .map(p => {
          const rel = path.relative(root, p);
          if (rel.startsWith('..')) return null;
          const parts = rel.split(path.sep);
          if (parts.length < 3) return null;   // needs root/topic/problem/file
          return path.join(root, parts[0], parts[1]);   // topic/problem
        })
        .find(Boolean) || null
    : null;

  // 2: REmove all problems in this topic from index
  const problemsInTopic = scanProblemsInTopic(topicPath);
  for (const prob of problemsInTopic) {
    const relProbPath = path.relative(root, path.join(topicPath, prob))
      .split(path.sep).join('/');
    onProblemDeleted(root, relProbPath);
  }

  // 3: Delete the topic folder
  rmDir(topicPath);

  // 4: Renumber remaining topics, build old→new map
  const remainingTopics = discoverTopics(root);
  let counter = 1;
  const renameMap = new Map();

  for (const topic of remainingTopics) {
    const oldPrefixMatch = topic.match(/^(\d+)_/);
    const oldPrefix = oldPrefixMatch ? parseInt(oldPrefixMatch[1], 10) : null;
    const newPrefix = String(counter).padStart(2, '0');

    if (String(oldPrefix).padStart(2, '0') !== newPrefix) {
      const oldPath = path.join(root, topic);
      const newName = topic.replace(/^\d+/, newPrefix);
      const newPath = path.join(root, newName);

      try {
        rename(oldPath, newPath);
        updateLinksAcrossWorkspace(root, oldPath, newPath, null);

        // Update index entries for every problem inside this renamed topic
        const problemsInRenamed = scanProblemsInTopic(newPath);
        for (const prob of problemsInRenamed) {
          const oldProbRel = path.relative(root, path.join(oldPath, prob))
            .split(path.sep).join('/');
          const newProbRel = path.relative(root, path.join(newPath, prob))
            .split(path.sep).join('/');
          onProblemRenamed(root, oldProbRel, newProbRel);
        }

        renameMap.set(oldPath, newPath);
      } catch (err) {
        vscode.window.showErrorMessage(`Failed to rename topic '${topic}': ${err.message}`);
        console.error('[delete-problem] topic rename error:', err.message);
        break;
      }
    }
    counter++;
  }

  // 5: Strike tracker + cleanup markdown
  strikeAllTopicRows(getTrackerPath(root), topicName);
  cleanupMarkdownReferences(root, topicName, null);

  // 6: Reopen layout if affected topic was open
  if (openIsInsideDeletedTopic) {
    await clearLayout();
    vscode.window.showInformationMessage(
      `✓ Deleted topic: ${topicName} (was open — layout cleared)`
    );
  } else if (openProblemDir) {
    const openTopicPath  = path.dirname(openProblemDir);
    const renamedTopicPath = renameMap.get(openTopicPath);

    if (renamedTopicPath) {
      const problemFolderName = path.basename(openProblemDir);
      const renamedProblemDir = path.join(renamedTopicPath, problemFolderName);
      const { openLayout } = require('../ui/layout');
      await openLayout(renamedProblemDir);
      vscode.window.showInformationMessage(
        `✓ Deleted topic: ${topicName} — reopened ${problemFolderName}`
      );
    }
  }

  if (discoverTopics(root).length === 0) {
    vscode.window.showWarningMessage('Workspace has no topics remaining.');
  }
}

// delete command - pick topic, pick item, confirm, delete
async function cmdDeleteProblem() {
  try {
    const root = getWorkspaceRoot();
    if (!root) return;

    const topics = discoverTopics(root);
    if (topics.length === 0) {
      vscode.window.showInformationMessage('DSA Layout: No topics found.');
      return;
    }

    const pickedTopic = await showTopicPicker(topics);
    if (!pickedTopic) return;

    const topicPath = path.join(root, pickedTopic.label);
    const problems = scanProblemsInTopic(topicPath);

    const pickedOption = await showDeletePicker(pickedTopic.label, problems);
    if (!pickedOption) return;

    const isWholeTopic = pickedOption.value === 'topic';
    const confirmed = await confirmDelete(isWholeTopic, isWholeTopic ? pickedTopic.label : pickedOption.value);
    if (!confirmed) return;

    // close layout if deleting open problem
    const targetPath = isWholeTopic ? topicPath : path.join(topicPath, pickedOption.value);
    const openTabs = vscode.window.tabGroups.all.flatMap(g => g.tabs);
    const hasOpenTabInTarget = openTabs.some(tab => {
      if (!tab || !tab.uri) return false;
      return tab.uri.fsPath.startsWith(targetPath);
    });
    if (hasOpenTabInTarget) await clearLayout();

    if (isWholeTopic) await deleteWholeTopic(root, pickedTopic.label, topicPath);
    else await deleteSingleProblem(root, pickedTopic.label, topicPath, pickedOption.value);

    vscode.window.showInformationMessage(`✓ Deleted: ${isWholeTopic ? pickedTopic.label : pickedOption.value}`);
  } catch (err) {
    vscode.window.showErrorMessage(`DSA Layout error: ${err.message}`);
    console.error('[delete-problem] error:', err.message, err.stack);
  }
}

module.exports = { cmdDeleteProblem };