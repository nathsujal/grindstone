#!/usr/bin/env node
// ================================================================
// test-lc-fetch.js
// Standalone test — no VS Code, no extension runtime needed.
// Run: node test-lc-fetch.js <leetcode-url>
//
// Example:
//   node test-lc-fetch.js https://leetcode.com/problems/add-two-numbers/
// ================================================================

const LC_GRAPHQL_URL = 'https://leetcode.com/graphql';

const QUERY = `
  query questionData($titleSlug: String!) {
    question(titleSlug: $titleSlug) {
      questionId
      title
      titleSlug
      difficulty
      content
      categoryTitle
      topicTags {
        name
      }
      exampleTestcases
      sampleTestCase
      hints
      codeSnippets {
        lang
        langSlug
        code
      }
    }
  }
`;

// ── Helpers ───────────────────────────────────────────────────────

function extractSlug(url) {
  const match = url.trim().match(/leetcode\.com\/problems\/([^/?#]+)/);
  if (!match) throw new Error(`Invalid LC URL: ${url}`);
  return match[1];
}

function stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<\/p>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<li>/gi, '- ')
    .replace(/<\/pre>/gi, '\n')
    .replace(/<pre>/gi, '\n```\n')
    .replace(/<code>/gi, '`')
    .replace(/<\/code>/gi, '`')
    .replace(/<\/?strong>/gi, '**')
    .replace(/<\/?em>/gi, '_')
    .replace(/<sup>/gi, '^')
    .replace(/<\/sup>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g,   '<')
    .replace(/&gt;/g,   '>')
    .replace(/&amp;/g,  '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#39;/g,  "'")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function getSnippet(snippets, langSlug) {
  if (!snippets?.length) return null;
  return snippets.find(s => s.langSlug === langSlug)?.code ?? null;
}

function separator(label) {
  const line = '─'.repeat(60);
  console.log(`\n${line}`);
  console.log(`  ${label}`);
  console.log(line);
}

/**
 * Split exampleTestcases into individual test cases.
 * Blank lines (\n\n) separate test cases; each test case
 * may have multiple lines separated by single \n.
 *
 * @param {string} raw  lc.exampleTestcases string
 * @returns {string[]}  array of test case strings
 */
function segmentExampleTestcases(raw) {
  if (!raw?.trim()) return [];
  return raw
    .trim()
    .split(/\n{2,}/)
    .map(c => c.trim())
    .filter(Boolean);
}

function sampleLineCount(sample) {
  return sample ? sample.trim().split('\n').length : 0;
}

// ── Fetch ─────────────────────────────────────────────────────────

async function fetchAndTest(url) {
  console.log('\n🔍 Fetching:', url);

  const slug = extractSlug(url);
  console.log('   Slug:', slug);

  const response = await fetch(LC_GRAPHQL_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      query: QUERY,
      variables: { titleSlug: slug },
    }),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const json = await response.json();

  if (json.errors?.length) {
    throw new Error(`GraphQL error: ${json.errors[0].message}`);
  }

  const q = json?.data?.question;
  if (!q) throw new Error('No question data in response');

  // ── Print every field we care about ──────────────────────────

  separator('BASIC INFO');
  console.log('questionId   :', q.questionId);
  console.log('title        :', q.title);
  console.log('titleSlug    :', q.titleSlug);
  console.log('difficulty   :', q.difficulty);
  console.log('categoryTitle:', q.categoryTitle);

  separator('TOPIC TAGS');
  if (q.topicTags?.length) {
    q.topicTags.forEach(t => console.log(' -', t.name));
  } else {
    console.log('  (none)');
  }

  separator('CONTENT (HTML → plain text)');
  const plainContent = stripHtml(q.content);
  // Print first 800 chars so terminal doesn't flood
  console.log(plainContent);
  if (plainContent.length > 800) {
    console.log(`\n  ... (${plainContent.length - 800} more chars truncated)`);
  }

separator('EXAMPLE TESTCASES');
  const testCases = segmentExampleTestcases(q.exampleTestcases);
  if (testCases.length === 0) {
    console.log('  (none)');
  } else {
    testCases.forEach((tc, i) => {
      const lines = tc.split('\n');
      console.log(`  ── Test Case ${i + 1} of ${testCases.length} ──`);
      if (lines.length > sampleLineCount(q.sampleTestCase) && testCases.length === 1) {
        console.log('  ⚠️  WARNING: no blank-line separators in exampleTestcases.');
        console.log(`  ⚠️  sampleTestCase has ${sampleLineCount(q.sampleTestCase)} line(s) — this test case has ${lines.length}.`);
        console.log('  ⚠️  May contain multiple test cases. Verify before trusting input.txt.');
      }
      console.log(tc.split('\n').map(l => '    ' + l).join('\n'));
    });
  }

  separator('SAMPLE TESTCASE (== Test Case 1)');
  console.log(q.sampleTestCase ?? '(none)');

  separator('HINTS');
  if (q.hints?.length) {
    q.hints.forEach((h, i) => console.log(`  Hint ${i + 1}: ${h.slice(0, 120)}...`));
  } else {
    console.log('  (none)');
  }

  separator('CODE SNIPPETS AVAILABLE');
  if (q.codeSnippets?.length) {
    q.codeSnippets.forEach(s => console.log(` ${s.langSlug.padEnd(20)} → ${s.lang}`));
  } else {
    console.log('  (none)');
  }

  separator('PYTHON3 SNIPPET (→ solution.py)');
  const py = getSnippet(q.codeSnippets, 'python3');
  console.log(py ?? '  ⚠️  Not found — will use template');

  separator('C++ SNIPPET (→ solution.cpp)');
  const cpp = getSnippet(q.codeSnippets, 'cpp');
  console.log(cpp ?? '  ⚠️  Not found — will use template');

  separator('RUST SNIPPET (→ solution.rs)');
  const rs = getSnippet(q.codeSnippets, 'rust');
  console.log(rs ?? '  ⚠️  Not found — will use template');

  separator('FOLDER NAME (generated)');
  const numStr     = '001';   // placeholder — real value from getNextNumber()
  const snakeName  = q.titleSlug.replace(/-/g, '_');
  const folderName = `${numStr}_${snakeName}`;
  console.log(folderName);

  separator('DONE ✓');
  console.log('  All fields extracted successfully.\n');
}

// ── Entry point ───────────────────────────────────────────────────

const url = process.argv[2];

if (!url) {
  console.error('\nUsage: node test-lc-fetch.js <leetcode-url>');
  console.error('Example: node test-lc-fetch.js https://leetcode.com/problems/two-sum/\n');
  process.exit(1);
}

fetchAndTest(url).catch(err => {
  console.error('\n❌ Error:', err.message);
  process.exit(1);
});