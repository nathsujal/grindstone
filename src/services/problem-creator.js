'use strict';

const fs = require('fs');
const path = require('path');
const { getNextProblemNumber } = require('../utils/workspace');
const { writeTestCasesToProblemMd, syncTestCasesToInput } = require('../utils/testcase-sync');
const {
  buildProblemMd,
  buildPythonSolution,
  buildCppSolution,
  buildRustSolution,
} = require('../utils/lc-mapper');

/**
 * Create a problem folder with all files. Pure logic — no UI calls.
 *
 * @param {string} root
 * @param {string} topic
 * @param {Object} problemData
 * @returns {{ problemDir: string, numStr: string } | null}
 */
function createProblem(root, topic, problemData) {
  const topicPath = path.join(root, topic);
  const numStr = getNextProblemNumber(topicPath);
  const folderName = buildFolderName(numStr, problemData.titleSlug);
  const problemDir = path.join(topicPath, folderName);

  if (fs.existsSync(problemDir)) {
    return null; // Already exists
  }

  // Create folder
  fs.mkdirSync(problemDir, { recursive: true });

  try {
    // Write PROBLEM.md
    fs.writeFileSync(
      path.join(problemDir, 'PROBLEM.md'),
      buildProblemMd(problemData, topic),
      'utf8',
    );

    // Fill test cases
    if (problemData.exampleTestcases) {
      writeTestCasesToProblemMd(problemDir, problemData.sampleTestCase);
    }

    // Write solution files
    fs.writeFileSync(path.join(problemDir, 'solution.py'), buildPythonSolution(problemData, numStr), 'utf8');
    fs.writeFileSync(path.join(problemDir, 'solution.cpp'), buildCppSolution(problemData, numStr), 'utf8');
    fs.writeFileSync(path.join(problemDir, 'solution.rs'), buildRustSolution(problemData, numStr), 'utf8');

    // Sync testcases → root/input.txt
    syncTestCasesToInput(root, problemDir);

    // Ensure root/output.txt exists
    const globalOutputPath = path.join(root, 'output.txt');
    if (!fs.existsSync(globalOutputPath)) {
      fs.writeFileSync(globalOutputPath, '', 'utf8');
    }

    console.log(`[problem-creator] created ${problemDir}`);
  } catch (err) {
    // Rollback: delete the half-created folder
    try {
      fs.rmSync(problemDir, { recursive: true, force: true });
      console.log(`[problem-creator] rolled back ${problemDir}`);
    } catch (rollbackErr) {
      console.error(`[problem-creator] rollback failed: ${rollbackErr.message}`);
    }
    throw err;
  }

  return { problemDir, numStr };
}

/**
 * Sanitize a LeetCode slug into a safe folder name.
 *
 * @param {string} slug
 * @returns {string}
 */
function sanitizeFolderName(slug) {
  const safe = slug.replace(/[^a-zA-Z0-9_-]/g, '_');
  const collapsed = safe.replace(/_+/g, '_');
  return collapsed.replace(/^_+|_+$/g, '') || 'untitled';
}

/**
 * Build a problem folder name from number and slug.
 *
 * @param {string} numStr
 * @param {string} titleSlug
 * @returns {string}
 */
function buildFolderName(numStr, titleSlug) {
  const safeName = sanitizeFolderName(titleSlug.replace(/-/g, '_'));
  return `${numStr}_${safeName}`;
}

module.exports = { createProblem, buildFolderName, sanitizeFolderName };
