'use strict';

const fs = require('fs');
const path = require('path');
const vscode = require('vscode');

// read file - returns null if not exist
function readFile(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, 'utf8');
}

// write file - creates dirs if needed
function writeFile(filePath, content) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

// check if path exists
function exists(filePath) {
  return fs.existsSync(filePath);
}

// check if path is directory
function isDir(filePath) {
  try { return fs.statSync(filePath).isDirectory(); }
  catch { return false; }
}

// scan all .md files in workspace
function scanMarkdownFiles(root) {
  const mdFiles = [];
  const skip = n => n.startsWith('_') || n.startsWith('.');

  const scan = dir => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (skip(entry.name)) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) scan(fullPath);
      else if (entry.isFile() && entry.name.endsWith('.md')) mdFiles.push(fullPath);
    }
  };

  try {
    scan(root);
  } catch (err) {
    vscode.window.showErrorMessage(`DSA: Cannot scan workspace for markdown files: ${err.message}`);
    throw err;
  }

  return mdFiles;
}

// strike deleted references in markdown files
function cleanupMarkdownReferences(root, deletedTopic, deletedProblem) {
  const mdFiles = scanMarkdownFiles(root);
  for (const mdFile of mdFiles) {
    let content = readFile(mdFile);
    let modified = false;

    if (deletedProblem) {
      const fullPattern = new RegExp(`(${deletedTopic}/${deletedProblem})`, 'g');
      const namePattern = new RegExp(`\\b(${deletedProblem})\\b`, 'g');
      if (fullPattern.test(content)) { content = content.replace(fullPattern, '~~$1~~'); modified = true; }
      if (namePattern.test(content)) { content = content.replace(namePattern, '~~$1~~'); modified = true; }
    } else {
      const topicPattern = new RegExp(`(${deletedTopic}/\\d+_\\w+)`, 'g');
      if (topicPattern.test(content)) { content = content.replace(topicPattern, '~~$1~~'); modified = true; }
    }

    if (modified) writeFile(mdFile, content);
  }
}

// remove directory
function rmDir(dirPath) {
  if (exists(dirPath)) fs.rmSync(dirPath, { recursive: true, force: true });
}

// rename file/dir
function rename(oldPath, newPath) {
  fs.renameSync(oldPath, newPath);
}

module.exports = {
  readFile, writeFile, exists, isDir,
  scanMarkdownFiles, cleanupMarkdownReferences,
  rmDir, rename
};