'use strict';

/**
 * Fetches problem data from LeetCode's public GraphQL API.
 * No auth required for public problems.
 */

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

/**
 * Validate a LeetCode URL format.
 *
 * @param {string} url
 * @returns {boolean}
 */
function isValidLeetCodeUrl(url) {
  if (!url || typeof url !== 'string') return false;
  return /leetcode\.com\/problems\/[^/?#]+/.test(url);
}

/**
 * Extract slug from a LeetCode URL.
 * Handles:
 *   https://leetcode.com/problems/two-sum/
 *   https://leetcode.com/problems/two-sum/description/
 *   https://www.leetcode.com/problems/two-sum
 *
 * @param {string} url
 * @returns {string} slug e.g. 'two-sum'
 * @throws if URL is not a valid LC problem URL
 */
function extractSlug(url) {
  const match = url.trim().match(/leetcode\.com\/problems\/([^/?#]+)/);
  if (!match) {
    throw new Error(
      `Invalid LeetCode URL: "${url}"\n` +
        'Expected format: https://leetcode.com/problems/two-sum/',
    );
  }
  return match[1];
}

/**
 * Fetch full problem data from LC GraphQL API.
 *
 * @param {string} url  LeetCode problem URL
 * @returns {Promise<LCProblem>}
 * @throws on network error, invalid URL, or problem not found
 */
async function fetchLeetCodeProblem(url) {
  const slug = extractSlug(url);

  let response;
  try {
    response = await fetch(LC_GRAPHQL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: QUERY,
        variables: { titleSlug: slug },
      }),
    });
  } catch (err) {
    throw new Error(`Network error fetching LC problem: ${err.message}`);
  }

  if (!response.ok) {
    throw new Error(`LC API returned ${response.status}: ${response.statusText}`);
  }

  let json;
  try {
    json = await response.json();
  } catch {
    throw new Error('LC API returned invalid JSON');
  }

  if (json.errors?.length) {
    throw new Error(`LC API error: ${json.errors[0].message}`);
  }

  const problem = json?.data?.question;
  if (!problem) {
    throw new Error(`Problem not found for slug "${slug}"`);
  }

  return problem;
}

/**
 * Strip HTML tags from LC content field.
 * LC returns content as HTML — we want plain text for PROBLEM.md.
 *
 * Handles:
 *   <p>, <strong>, <em>, <code>, <pre>, <ul>, <li>, <sup>, <sub>
 *   HTML entities: &lt; &gt; &amp; &nbsp; &#39;
 *
 * @param {string} html
 * @returns {string} plain text
 */
function stripHtml(html) {
  if (!html) return '';

  return (
    html
      // Block elements → newlines before stripping
      .replace(/<\/p>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/li>/gi, '\n')
      .replace(/<li>/gi, '- ')
      .replace(/<\/pre>/gi, '\n')
      .replace(/<pre>/gi, '\n```\n')
      // Code blocks
      .replace(/<code>/gi, '`')
      .replace(/<\/code>/gi, '`')
      // Bold / italic → keep text
      .replace(/<\/?strong>/gi, '**')
      .replace(/<\/?em>/gi, '_')
      // Superscript
      .replace(/<sup>/gi, '^')
      .replace(/<\/sup>/gi, '')
      // Strip all remaining tags
      .replace(/<[^>]+>/g, '')
      // HTML entities
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&nbsp;/g, ' ')
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"')
      // Collapse 3+ newlines to 2
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}

/**
 * Find a code snippet by langSlug.
 * LC slugs: 'python3', 'cpp', 'rust', 'java', etc.
 *
 * @param {Object[]} snippets   codeSnippets array from LC
 * @param {string}   langSlug
 * @returns {string|null}  code string or null if not found
 */
function getSnippet(snippets, langSlug) {
  if (!snippets?.length) return null;
  const found = snippets.find((s) => s.langSlug === langSlug);
  return found?.code ?? null;
}

module.exports = {
  fetchLeetCodeProblem,
  extractSlug,
  stripHtml,
  getSnippet,
  isValidLeetCodeUrl,
};
