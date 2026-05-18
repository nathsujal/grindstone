'use strict';

// template fallbacks - used when _templates folder missing

const DEFAULT_PROBLEM_TEMPLATE = `# [Problem Number] — [Problem Name]

**Link:** 
**Topic:** 
**Difficulty:** 

---

## Problem Summary


---

## Approach

**Idea:** 

**Time complexity:** O(?) 
**Space complexity:** O(?)`;

const DEFAULT_SOLUTION_PY = '# Python solution\n';
const DEFAULT_SOLUTION_CPP = `// C++ solution
#include <bits/stdc++.h>
using namespace std;

int main() { return 0; }
`;
const DEFAULT_SOLUTION_RS = '// Rust solution\nfn main() {}\n';

function getDefaultTemplates() {
  return {
    'PROBLEM_TEMPLATE.md': DEFAULT_PROBLEM_TEMPLATE,
    'solution_template.py': DEFAULT_SOLUTION_PY,
    'solution_template.cpp': DEFAULT_SOLUTION_CPP,
    'solution_template.rs': DEFAULT_SOLUTION_RS
  };
}

module.exports = { getDefaultTemplates };