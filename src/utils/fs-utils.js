'use strict';

const fs = require('fs');
const path = require('path');
const constants = require('../constants');
const { getDefaultTemplates } = require('./defaults');

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

// read templates from _templates folder
function getTemplates(root) {
  const templatesDir = path.join(root, constants.FOLDER_TEMPLATES);
  if (!exists(templatesDir)) return getDefaultTemplates();

  const templates = {};
  for (const file of constants.FILES_SOLUTIONS) {
    const tplName = file.replace('solution', 'solution_template');
    const filePath = path.join(templatesDir, tplName);
    if (exists(filePath)) templates[tplName] = readFile(filePath);
  }

  const problemTpl = path.join(templatesDir, constants.FILE_PROBLEM.replace('.md', '_TEMPLATE.md'));
  if (exists(problemTpl)) templates['PROBLEM_TEMPLATE.md'] = readFile(problemTpl);

  if (Object.keys(templates).length === 0) return getDefaultTemplates();
  return templates;
}

// create problem folder with scaffolded files
function createProblemFolder(problemDir, number, name, root) {
  fs.mkdirSync(problemDir, { recursive: true });
  const templates = getTemplates(root);

  const problemContent = templates['PROBLEM_TEMPLATE.md']
    .replace(/\[Problem Number\]/g, number)
    .replace(/\[Problem Name\]/g, name);

  writeFile(path.join(problemDir, constants.FILE_PROBLEM), problemContent);
  writeFile(path.join(problemDir, 'solution.py'), templates['solution_template.py'] || '# Python solution\n');
  writeFile(path.join(problemDir, 'solution.cpp'), templates['solution_template.cpp'] || '// C++ solution\n');
  writeFile(path.join(problemDir, 'solution.rs'), templates['solution_template.rs'] || '// Rust solution\n');
}

// scan all .md files in workspace
function scanMarkdownFiles(root) {
  const mdFiles = [];
  const skip = n => n.startsWith('_') || n.startsWith('.');

  const scan = dir => {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (skip(entry.name)) continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) scan(fullPath);
        else if (entry.isFile() && entry.name.endsWith('.md')) mdFiles.push(fullPath);
      }
    } catch (err) { console.error(`[fs-utils] scan error: ${err.message}`); }
  };

  scan(root);
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

// update references when renaming
function updateMarkdownReferences(root, oldName, newName) {
  if (oldName === newName) return;
  const mdFiles = scanMarkdownFiles(root);
  for (const mdFile of mdFiles) {
    const content = readFile(mdFile);
    if (content && content.includes(oldName)) writeFile(mdFile, content.split(oldName).join(newName));
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
  getTemplates, createProblemFolder,
  scanMarkdownFiles, cleanupMarkdownReferences, updateMarkdownReferences,
  rmDir, rename
};