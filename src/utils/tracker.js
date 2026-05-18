'use strict';

const fs = require('fs');
const vscode = require('vscode');
const path = require('path');
const constants = require('../constants');
const { readFile, writeFile, exists } = require('./fs-utils');

// get tracker path
function getTrackerPath(root) {
  return path.join(root, constants.FOLDER_PROGRESS, constants.FILE_TRACKER);
}

// append new problem row to tracker
async function updateTracker(root, topic, number, name) {
  const trackerPath = getTrackerPath(root);
  if (!exists(trackerPath)) {
    vscode.window.showWarningMessage('DSA Layout: TRACKER.md not found. Skipping update.');
    return;
  }
  try {
    const today = new Date().toISOString().split('T')[0];
    const row = `| ${topic} | ${number} | ${name} | ? | Todo | — | ${today} |`;
    fs.appendFileSync(trackerPath, '\n' + row);
  } catch (err) { console.error('[tracker] failed to update TRACKER.md:', err.message); }
}

// strike single problem row in tracker
function strikeTrackerRow(trackerPath, topicName, problemNum) {
  if (!exists(trackerPath)) { console.log('[tracker] TRACKER.md not found, skipping strikethrough'); return; }

  const lines = readFile(trackerPath).split('\n');
  const updated = lines.map(line => {
    if (!line.includes('|')) return line;
    const cells = line.split('|').filter(c => c.trim());
    if (cells.length < 2) return line;

    const rowTopic = cells[0].trim();
    const rowNum = cells[1].trim();

    if (rowNum === problemNum && (rowTopic === topicName || rowTopic.includes(topicName.replace(/^\d+_/, '')))) {
      if (rowTopic.startsWith('~~')) return line;
      const struck = cells.map(cell => {
        const trimmed = cell.trim();
        if (!trimmed || trimmed.startsWith('~~')) return trimmed;
        return '~~' + trimmed + '~~';
      });
      return '| ' + struck.join(' | ') + ' |';
    }
    return line;
  });

  writeFile(trackerPath, updated.join('\n'));
}

// strike all rows for a topic
function strikeAllTopicRows(trackerPath, topicName) {
  if (!exists(trackerPath)) { console.log('[tracker] TRACKER.md not found, skipping strikethrough'); return; }

  const topicBase = topicName.replace(/^\d+_/, '');
  const lines = readFile(trackerPath).split('\n');
  const updated = lines.map(line => {
    if (!line.includes('|')) return line;
    const cells = line.split('|').filter(c => c.trim());
    if (cells.length < 1) return line;

    const rowTopic = cells[0].trim();
    const matches = rowTopic === topicName || rowTopic === topicBase || rowTopic.includes(topicBase);
    if (!matches) return line;
    if (rowTopic.startsWith('~~')) return line;

    const struck = cells.map(cell => {
      const trimmed = cell.trim();
      if (!trimmed || trimmed.startsWith('~~')) return trimmed;
      return '~~' + trimmed + '~~';
    });
    return '| ' + struck.join(' | ') + ' |';
  });

  writeFile(trackerPath, updated.join('\n'));
}

module.exports = { getTrackerPath, updateTracker, strikeTrackerRow, strikeAllTopicRows };