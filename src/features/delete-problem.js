'use strict';

const vscode = require('vscode');
const path = require('path');
const { getWorkspaceRoot, discoverTopics, scanProblemsInTopic, parseProblemNumber } = require('../utils/workspace');
const { rmDir, rename, cleanupMarkdownReferences, exists } = require('../utils/fs-utils');
const { getTrackerPath, strikeTrackerRow, strikeAllTopicRows } = require('../utils/tracker');
const { showTopicPicker, showDeletePicker, confirmDelete } = require('../ui/picker');
const { clearLayout, openLayout } = require('../ui/layout');
const { showDoc, sleep } = require('../utils/async');
const { onProblemRenamed, onProblemDeleted, getReferencingFiles } = require('../services/link-index');
const { updateLinksAcrossWorkspace, updateTrackerRow } = require('../utils/md-updater');
const { getOpenProblemDir } = require('../utils/tab-utils');

// delete single problem + renumber remaining
async function deleteSingleProblem(root, topicName, topicPath, problemName) {
  const problemPath = path.join(topicPath, problemName);
  const deletedNum = parseProblemNumber(problemName);

  // 1: Snapshot open problem dir BEFORE any changes
  const openProblemDir = getOpenProblemDir(root);

  // 2: Remove from index + delete folder
  removeFromIndexAndDelete(root, problemPath);

  // 3: Renumber remaining problems
  const renameMap = await renumberProblems(root, topicPath, topicName);

  // 4: Strike tracker row + cleanup markdown references
  strikeTrackerAndCleanup(root, topicName, problemName, deletedNum);

  // 5: Reopen layout if the open problem was renamed or deleted
  await reopenLayoutAfterDelete(root, openProblemDir, problemPath, renameMap, problemName);

  if (scanProblemsInTopic(topicPath).length === 0) {
    vscode.window.showWarningMessage(`Topic '${topicName}' is now empty.`);
  }
}

function removeFromIndexAndDelete(root, problemPath) {
  onProblemDeleted(root, path.relative(root, problemPath).split(path.sep).join('/'));
  rmDir(problemPath);
}

async function renumberProblems(root, topicPath, topicName) {
  const remaining = scanProblemsInTopic(topicPath);
  let counter = 1;
  const renameMap = new Map();

  for (const prob of remaining) {
    const oldNum = parseProblemNumber(prob);
    const newNumStr = String(counter).padStart(3, '0');

    if (oldNum !== counter) {
      const renamed = await renameProblem(root, topicPath, prob, newNumStr, topicName);
      if (renamed) {
        renameMap.set(renamed.oldPath, renamed.newPath);
      } else {
        break;  // rename failed, stop renumbering
      }
    }
    counter++;
  }

  return renameMap;
}

async function renameProblem(root, topicPath, prob, newNumStr, topicName) {
  const oldPath = path.join(topicPath, prob);
  const newName = prob.replace(/^\d+_/, newNumStr + '_');
  const newPath = path.join(topicPath, newName);

  try {
    rename(oldPath, newPath);
    const probNameOnly = prob.replace(/^\d+_/, '');

    // Fix all markdown links in workspace pointing to old path
    const oldRelPath = path.relative(root, oldPath).split(path.sep).join('/');
    const referencingFiles = getReferencingFiles(root, oldRelPath);
    updateLinksAcrossWorkspace(
      root,
      oldPath,
      newPath,
      referencingFiles.length > 0
        ? referencingFiles.map(f => path.join(root, f))
        : null
    );

    // Fix number cell in TRACKER.md row
    updateTrackerRow(
      getTrackerPath(root),
      topicName,
      probNameOnly,
      newNumStr
    );

    // Update in-memory index
    onProblemRenamed(
      root,
      oldRelPath,
      path.relative(root, newPath).split(path.sep).join('/')
    );

    return { oldPath, newPath };
  } catch (err) {
    vscode.window.showErrorMessage(`Failed to rename '${prob}' to '${newName}': ${err.message}`);
    console.error('[delete-problem] rename error:', err.message);
    return null;
  }
}

function strikeTrackerAndCleanup(root, topicName, problemName, deletedNum) {
  if (deletedNum) {
    const trackerPath = getTrackerPath(root);
    strikeTrackerRow(trackerPath, topicName, String(deletedNum).padStart(3, '0'));
  }
  cleanupMarkdownReferences(root, topicName, problemName);
}

async function reopenLayoutAfterDelete(root, openProblemDir, problemPath, renameMap, problemName) {
  if (!openProblemDir) return;

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

// delete entire topic + renumber remaining topics
async function deleteWholeTopic(root, topicName, topicPath) {

  // 1: Snapshot open problem dir BEFORE any changes
  const openProblemDir = getOpenProblemDir(root);
  const openIsInsideDeletedTopic = openProblemDir
    ? openProblemDir.startsWith(topicPath + path.sep) || openProblemDir === topicPath
    : false;

  // 2: Remove all problems from index + delete folder
  removeAllFromIndexAndDelete(root, topicPath);

  // 3: Renumber remaining topics
  const renameMap = await renumberTopics(root);

  // 4: Strike tracker + cleanup markdown
  strikeAllTrackerAndCleanup(root, topicName);

  // 5: Reopen layout if affected topic was open
  await reopenLayoutAfterTopicDelete(root, openProblemDir, openIsInsideDeletedTopic, topicName, renameMap);

  if (discoverTopics(root).length === 0) {
    vscode.window.showWarningMessage('Workspace has no topics remaining.');
  }
}

function removeAllFromIndexAndDelete(root, topicPath) {
  const problemsInTopic = scanProblemsInTopic(topicPath);
  for (const prob of problemsInTopic) {
    const relProbPath = path.relative(root, path.join(topicPath, prob))
      .split(path.sep).join('/');
    onProblemDeleted(root, relProbPath);
  }
  rmDir(topicPath);
}

async function renumberTopics(root) {
  const remainingTopics = discoverTopics(root);
  let counter = 1;
  const renameMap = new Map();

  for (const topic of remainingTopics) {
    const oldPrefixMatch = topic.match(/^(\d+)_/);
    const oldPrefix = oldPrefixMatch ? parseInt(oldPrefixMatch[1], 10) : null;
    const newPrefix = String(counter).padStart(2, '0');

    if (String(oldPrefix).padStart(2, '0') !== newPrefix) {
      const renamed = await renameTopic(root, topic, newPrefix);
      if (renamed) {
        renameMap.set(renamed.oldPath, renamed.newPath);
      } else {
        break;
      }
    }
    counter++;
  }

  return renameMap;
}

async function renameTopic(root, topic, newPrefix) {
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

    return { oldPath, newPath };
  } catch (err) {
    vscode.window.showErrorMessage(`Failed to rename topic '${topic}': ${err.message}`);
    console.error('[delete-problem] topic rename error:', err.message);
    return null;
  }
}

function strikeAllTrackerAndCleanup(root, topicName) {
  strikeAllTopicRows(getTrackerPath(root), topicName);
  cleanupMarkdownReferences(root, topicName, null);
}

async function reopenLayoutAfterTopicDelete(root, openProblemDir, openIsInsideDeletedTopic, topicName, renameMap) {
  if (openIsInsideDeletedTopic) {
    await clearLayout();
    vscode.window.showInformationMessage(
      `✓ Deleted topic: ${topicName} (was open — layout cleared)`
    );
  } else if (openProblemDir) {
    const openTopicPath    = path.dirname(openProblemDir);
    const renamedTopicPath = renameMap.get(openTopicPath);

    if (renamedTopicPath) {
      const problemFolderName = path.basename(openProblemDir);
      const renamedProblemDir = path.join(renamedTopicPath, problemFolderName);
      await openLayout(renamedProblemDir);
      vscode.window.showInformationMessage(
        `✓ Deleted topic: ${topicName} — reopened ${problemFolderName}`
      );
    }
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

    // Delegate to sub-functions — they handle layout clear/reopen internally
    if (isWholeTopic) await deleteWholeTopic(root, pickedTopic.label, topicPath);
    else await deleteSingleProblem(root, pickedTopic.label, topicPath, pickedOption.value);

    vscode.window.showInformationMessage(`✓ Deleted: ${isWholeTopic ? pickedTopic.label : pickedOption.value}`);
  } catch (err) {
    vscode.window.showErrorMessage(`GrindStone error: ${err.message}`);
    console.error('[delete-problem] error:', err.message, err.stack);
  }
}

module.exports = { cmdDeleteProblem };
