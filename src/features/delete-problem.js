'use strict';

const vscode = require('vscode');
const path = require('path');
const {
  getWorkspaceRoot,
  discoverTopics,
  scanProblemsInTopic,
} = require('../utils/workspace');
const { rmDir, rename } = require('../utils/fs-utils');
const { showTopicPicker, showDeletePicker, confirmDelete } = require('../ui/picker');
const { clearLayout, openLayout } = require('../ui/layout');
const { getOpenProblemDir } = require('../utils/tab-utils');

// delete single problem + renumber remaining
async function deleteSingleProblem(root, topicName, topicPath, problemName) {
  const problemPath = path.join(topicPath, problemName);

  // 1: Snapshot open problem dir BEFORE any changes
  const openProblemDir = getOpenProblemDir(root);

  // 2: Delete folder
  rmDir(problemPath);

  // 3: Renumber remaining problems
  const renameMap = await renumberProblems(topicPath);

  // 4: Reopen layout if the open problem was renamed or deleted
  await reopenLayoutAfterDelete(openProblemDir, problemPath, renameMap, problemName);

  if (scanProblemsInTopic(topicPath).length === 0) {
    vscode.window.showWarningMessage(`Topic '${topicName}' is now empty.`);
  }
}

async function renumberProblems(topicPath) {
  const remaining = scanProblemsInTopic(topicPath);
  let counter = 1;
  const renameMap = new Map();

  for (const prob of remaining) {
    const oldNum = parseInt(prob.split('_')[0], 10);
    const newNumStr = String(counter).padStart(3, '0');

    if (oldNum !== counter) {
      const renamed = await renameProblem(topicPath, prob, newNumStr);
      if (renamed) {
        renameMap.set(renamed.oldPath, renamed.newPath);
      } else {
        break; // rename failed, stop renumbering
      }
    }
    counter++;
  }

  return renameMap;
}

async function renameProblem(topicPath, prob, newNumStr) {
  const oldPath = path.join(topicPath, prob);
  const newName = prob.replace(/^\d+_/, newNumStr + '_');
  const newPath = path.join(topicPath, newName);

  try {
    rename(oldPath, newPath);
    return { oldPath, newPath };
  } catch (err) {
    vscode.window.showErrorMessage(`Failed to rename '${prob}' to '${newName}': ${err.message}`);
    console.error('[delete-problem] rename error:', err.message);
    return null;
  }
}

async function reopenLayoutAfterDelete(openProblemDir, problemPath, renameMap, problemName) {
  if (!openProblemDir) return;

  const wasDeleted = openProblemDir === problemPath;
  const renamedTo = renameMap.get(openProblemDir);

  if (wasDeleted) {
    await clearLayout();
    vscode.window.showInformationMessage(`✓ Deleted: ${problemName} (was open — layout cleared)`);
  } else if (renamedTo) {
    await openLayout(renamedTo);
    vscode.window.showInformationMessage(
      `✓ Deleted: ${problemName} — reopened ${path.basename(renamedTo)}`,
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

  // 2: Delete topic folder
  rmDir(topicPath);

  // 3: Renumber remaining topics
  const renameMap = await renumberTopics(root);

  // 4: Reopen layout if affected topic was open
  await reopenLayoutAfterTopicDelete(
    openProblemDir,
    openIsInsideDeletedTopic,
    topicName,
    renameMap,
  );

  if (discoverTopics(root).length === 0) {
    vscode.window.showWarningMessage('Workspace has no topics remaining.');
  }
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
    return { oldPath, newPath };
  } catch (err) {
    vscode.window.showErrorMessage(`Failed to rename topic '${topic}': ${err.message}`);
    console.error('[delete-problem] topic rename error:', err.message);
    return null;
  }
}

async function reopenLayoutAfterTopicDelete(
  openProblemDir,
  openIsInsideDeletedTopic,
  topicName,
  renameMap,
) {
  if (openIsInsideDeletedTopic) {
    await clearLayout();
    vscode.window.showInformationMessage(
      `✓ Deleted topic: ${topicName} (was open — layout cleared)`,
    );
  } else if (openProblemDir) {
    const openTopicPath = path.dirname(openProblemDir);
    const renamedTopicPath = renameMap.get(openTopicPath);

    if (renamedTopicPath) {
      const problemFolderName = path.basename(openProblemDir);
      const renamedProblemDir = path.join(renamedTopicPath, problemFolderName);
      await openLayout(renamedProblemDir);
      vscode.window.showInformationMessage(
        `✓ Deleted topic: ${topicName} — reopened ${problemFolderName}`,
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
    const confirmed = await confirmDelete(
      isWholeTopic,
      isWholeTopic ? pickedTopic.label : pickedOption.value,
    );
    if (!confirmed) return;

    // Delegate to sub-functions — they handle layout clear/reopen internally
    if (isWholeTopic) await deleteWholeTopic(root, pickedTopic.label, topicPath);
    else await deleteSingleProblem(root, pickedTopic.label, topicPath, pickedOption.value);

    vscode.window.showInformationMessage(
      `✓ Deleted: ${isWholeTopic ? pickedTopic.label : pickedOption.value}`,
    );
  } catch (err) {
    vscode.window.showErrorMessage(`GrindStone error: ${err.message}`);
    console.error('[delete-problem] error:', err.message, err.stack);
  }
}

module.exports = { cmdDeleteProblem };
