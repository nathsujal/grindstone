'use strict';

const { stripHtml, getSnippet } = require('../services/leetcode');

/**
 * Build the full content of PROBLEM.md from LC problem data.
 *
 * @param {Object} lc        raw LC API response
 * @param {string} topicName e.g. '01_Arrays'
 * @returns {string}
 */
function buildProblemMd(lc, topicName) {
  const title      = lc.title ?? 'Unknown';
  const difficulty = lc.difficulty ?? '?';
  const content    = stripHtml(lc.content ?? '');
  const category   = lc.categoryTitle ?? '';
  const tags       = (lc.topicTags ?? []).map(t => t.name).join(', ') || '—';
  const lcUrl      = `https://leetcode.com/problems/${lc.titleSlug}/`;
  const hints      = lc.hints ?? [];

  const hintsSection = hints.length > 0
    ? '## Hints\n\n' +
      hints.map((h, i) => `<details>\n<summary>Hint ${i + 1}</summary>\n\n${h}\n\n</details>`).join('\n\n')
    : '';

  const testCasesSection = '## Test Cases\n\n<!-- filled automatically from LC examples -->\n';

  return `\
# ${title}

**Link:** ${lcUrl}
**Topic:** ${topicName}
**Category:** ${category}
**Difficulty:** ${difficulty}
**Tags:** ${tags}
**Date first attempted:** ${today()}

---

## Problem Statement

${content}

---

${testCasesSection}
---

## Approach 1 — [Name]

**Idea:**

**Time complexity:** O(?)
**Space complexity:** O(?)

---

## Approach 2 — [Name] *(if applicable)*

**Idea:**

**Time complexity:** O(?)
**Space complexity:** O(?)

---

## Mistakes I Made

- [ ] 

---

## Key Insight / What I Learned

${hintsSection ? '\n---\n\n' + hintsSection : ''}

---

## Languages Solved

- [ ] Python
- [ ] Rust
- [ ] C++
`;
}

/**
 * Build solution.py content.
 * Uses LC's python3 snippet if available, else minimal template.
 *
 * @param {Object} lc
 * @param {string} numStr
 * @returns {string}
 */
function buildPythonSolution(lc, _numStr) {
  const snippet = getSnippet(lc.codeSnippets, 'python3');
  const header  = buildHeader(lc);

  return header + '\n' + (snippet ?? 'class Solution:\n    pass\n');
}

/**
 * Build solution.cpp content.
 *
 * @param {Object} lc
 * @param {string} numStr
 * @returns {string}
 */
function buildCppSolution(lc, _numStr) {
  const snippet = getSnippet(lc.codeSnippets, 'cpp');
  const header  = buildHeader(lc);

  const boilerplate = snippet
    ? `#include <bits/stdc++.h>\nusing namespace std;\n\n${snippet}`
    : '#include <bits/stdc++.h>\nusing namespace std;\n\nclass Solution {\npublic:\n    \n};\n\nint main() {\n    ios_base::sync_with_stdio(false);\n    cin.tie(NULL);\n    return 0;\n}\n';

  return header + '\n' + boilerplate;
}

/**
 * Build solution.rs content.
 * Rust snippets are less common on LC — falls back to template.
 *
 * @param {Object} lc
 * @param {string} numStr
 * @returns {string}
 */
function buildRustSolution(lc, _numStr) {
  const snippet = getSnippet(lc.codeSnippets, 'rust');
  const header  = buildHeader(lc);

  return header + '\n' + (snippet ?? 'fn main() {\n    \n}\n');
}

/**
 * Build input.txt content from exampleTestcases.
 * LC's exampleTestcases is a newline-separated string of inputs.
 *
 * @param {Object} lc
 * @returns {string}
 */
function buildInputTxt(lc) {
  // Prefer exampleTestcases (multiple), fall back to sampleTestCase (single)
  const raw = lc.exampleTestcases ?? lc.sampleTestCase ?? '';
  return raw.trim() + '\n';
}

// Internal helpers

function buildHeader(lc) {
  return `\
// ============================================================
// Problem   : ${lc.title} — LeetCode #${lc.questionId}
// Link      : https://leetcode.com/problems/${lc.titleSlug}/
// Difficulty: ${lc.difficulty}
// Date      : ${today()}
// Approach  : 
// Time      : O(?)
// Space     : O(?)
// ============================================================
`;
}

function today() {
  return new Date().toISOString().split('T')[0];
}

module.exports = {
  buildProblemMd,
  buildPythonSolution,
  buildCppSolution,
  buildRustSolution,
  buildInputTxt,
};
