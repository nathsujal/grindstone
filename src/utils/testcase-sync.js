'use strict';

// @ts-check

const fs = require('fs');
const path = require('path');

/**
 * Read the ## Test Cases section from PROBLEM.md and write
 * all testcases to the global root/input.txt.
 *
 * Called on:
 *   - layout open (openLayout)
 *   - layout solution (runSolution)
 *
 * @param {string} root - Absolute workspace root path
 * @param {string} problemDir - Absolute path to problem directory
 * @returns {boolean} True if input.txt was updated, false if no testcases found
 */
function syncTestCasesToInput(root, problemDir) {
  const problemMdPath = path.join(problemDir, 'PROBLEM.md');
  const globalInputPath = path.join(root, 'input.txt');

  if (!fs.existsSync(problemMdPath)) {
    console.warn('[testcase-sync] PROBLEM.md not found:', problemMdPath);
    return false;
  }

  const content = fs.readFileSync(problemMdPath, 'utf8');
  const testCases = extractTestCases(content);

  if (testCases.length === 0) {
    console.log('[testcase-sync] no test cases found in PROBLEM.md');
    // Write empty input.txt rather than leaving stale content from previous problem
    fs.writeFileSync(globalInputPath, '', 'utf8');
    return false;
  }

  // Join all testcases with a blank line separator
  const inputContent = testCases.join('\n') + '\n';
  fs.writeFileSync(globalInputPath, inputContent, 'utf8');

  console.log(
    `[testcase-sync] wrote ${testCases.length} testcase(s) to input.txt`
  );
  return true;
}

/**
 * Extract raw testcase strings from PROBLEM.md content.
 * Looks for the ## Test Cases section, then pulls content
 * from every fenced code block (``` ... ```) inside it.
 *
 * @param {string} mdContent  full PROBLEM.md text
 * @returns {string[]}  array of testcase strings (trimmed)
 */
function extractTestCases(mdContent) {
  // Captures everything between ## Test Cases and the next ## heading (or EOF)
  const sectionMatch = mdContent.match(
    /^##\s+Test Cases\s*\n([\s\S]*?)(?=^##\s|\Z)/m
  );

  if (!sectionMatch) {
    // Try alternate heading names
    const altMatch = mdContent.match(
      /^##\s+Examples?\s*\n([\s\S]*?)(?=^##\s|\Z)/m
    );
    if (!altMatch) return [];
    return parseFencedBlocks(altMatch[1]);
  }

  return parseFencedBlocks(sectionMatch[1]);
}

/**
 * Extract content from all fenced code blocks in a string.
 * Handles ``` with or without language specifier.
 *
 * @param {string} text
 * @returns {string[]}
 */
function parseFencedBlocks(text) {
  const results = [];
  // Match ``` optionally followed by lang, then content, then ```
  const fenceRegex = /```[a-z]*\n([\s\S]*?)```/g;
  let match;

  while ((match = fenceRegex.exec(text)) !== null) {
    const trimmed = match[1].trim();
    if (trimmed) results.push(trimmed);
  }

  // Fallback: if no fenced blocks found, treat entire section as raw input
  if (results.length === 0) {
    const raw = text.trim();
    if (raw) results.push(raw);
  }

  return results;
}

/**
 * Write testcases from LC API response directly into PROBLEM.md's
 * ## Test Cases section. Called once during problem creation.
 *
 * LC's exampleTestcases is a newline-separated string where each
 * line is one argument. We wrap each in a fenced block.
 *
 * @param {string}   problemDir
 * @param {string}   rawTestcases   lc.exampleTestcases string
 */
function writeTestCasesToProblemMd(problemDir, rawTestcases) {
  const mdPath = path.join(problemDir, 'PROBLEM.md');
  if (!fs.existsSync(mdPath) || !rawTestcases?.trim()) return;

  // Split LC's exampleTestcases by blank lines — each block = one testcase
  const cases = rawTestcases
    .trim()
    .split(/\n{2,}/)                // multiple testcases separated by blank lines
    .map(c => c.trim())
    .filter(Boolean);

  // If no blank-line separation (single testcase or all on separate lines)
  // treat the whole string as one testcase
  const fencedCases = cases.length > 0
    ? cases.map(c => `\`\`\`\n${c}\n\`\`\``).join('\n\n')
    : `\`\`\`\n${rawTestcases.trim()}\n\`\`\``;

  const content = fs.readFileSync(mdPath, 'utf8');

  // Replace the ## Test Cases section content
  // The section was created by buildProblemMd with a placeholder
  const updated = content.replace(
    /(^##\s+Test Cases\s*\n)([\s\S]*?)(?=^##\s|\Z)/m,
    `$1\n${fencedCases}\n\n`
  );

  if (updated !== content) {
    fs.writeFileSync(mdPath, updated, 'utf8');
    console.log(`[testcase-sync] wrote ${cases.length} testcase(s) to PROBLEM.md`);
  }
}

module.exports = {
  syncTestCasesToInput,
  extractTestCases,
  writeTestCasesToProblemMd,
};