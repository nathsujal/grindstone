'use strict';

const vscode = require('vscode');

// show problem picker - returns selected item or null
async function showProblemPicker(items) {
  if (items.length === 0) {
    vscode.window.showErrorMessage('GrindStone: No problem folders found.');
    return null;
  }
  return vscode.window.showQuickPick(items, {
    placeHolder: 'Select a problem',
    matchOnDescription: true
  });
}

// show topic picker - returns selected topic or null
async function showTopicPicker(topics) {
  if (topics.length === 0) {
    vscode.window.showErrorMessage('GrindStone: No topic folders found.');
    return null;
  }
  const topicPicks = topics.map(t => ({ label: t }));
  return vscode.window.showQuickPick(topicPicks, {
    placeHolder: 'Select a topic',
    matchOnDescription: false
  });
}

// show delete options - topic or individual problems
async function showDeletePicker(topic, problems) {
  const hasProblems = problems.length > 0;
  const deleteOptions = [
    { label: `$(trash) Delete entire topic "${topic}"`, value: 'topic', description: 'Deletes all problems in this topic' }
  ];

  if (hasProblems) {
    deleteOptions.push(...problems.map(p => ({
      label: `$(file-directory) ${p}`,
      value: p,
      description: 'Delete single problem'
    })));
  }

  return vscode.window.showQuickPick(deleteOptions, {
    placeHolder: hasProblems ? 'Select what to delete' : 'Topic is empty - select delete entire topic',
    matchOnDescription: false
  });
}

// show input box for problem name
async function askProblemName() {
  return vscode.window.showInputBox({
    prompt: 'Problem name (e.g. two sum)',
    placeHolder: 'e.g. two sum'
  });
}

// confirm delete action
async function confirmDelete(isWholeTopic, itemName) {
  const confirmMessage = isWholeTopic
    ? `Delete entire topic "${itemName}" and all its problems? This cannot be undone.`
    : `Delete "${itemName}"? This cannot be undone.`;

  const confirm = await vscode.window.showWarningMessage(
    confirmMessage,
    { modal: true },
    'Delete',
    'Cancel'
  );
  return confirm === 'Delete';
}

module.exports = {
  showProblemPicker,
  showTopicPicker,
  showDeletePicker,
  askProblemName,
  confirmDelete
};