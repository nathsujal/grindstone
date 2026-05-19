'use strict';

const fs = require('fs');
const path = require('path');

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
  try {
    return fs.statSync(filePath).isDirectory();
  } catch {
    return false;
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
  writeFile,
  exists,
  isDir,
  rmDir,
  rename,
};
