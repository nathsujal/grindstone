'use strict';

// magic strings - centralized

const FOLDER_TEMPLATES = '_templates';
const FOLDER_PROGRESS = '_progress';
const FILE_TRACKER = 'TRACKER.md';
const FILE_PROBLEM = 'PROBLEM.md';
const FILE_INPUT = 'input.txt';
const FILE_OUTPUT = 'output.txt';
const FILES_SOLUTIONS = ['solution.py', 'solution.cpp', 'solution.rs'];
const LINK_INDEX_FILE = "_progress/link-index.json";
const CURRENT_INDEX_VERSION = 1;
const INDEX_PERSIST_DELAY   = 2000;   // ms debounce before writing to disk

module.exports = {
  FOLDER_TEMPLATES,
  FOLDER_PROGRESS,
  FILE_TRACKER,
  FILE_PROBLEM,
  FILE_INPUT,
  FILE_OUTPUT,
  FILES_SOLUTIONS,
  LINK_INDEX_FILE,
  CURRENT_INDEX_VERSION,
  INDEX_PERSIST_DELAY,
};