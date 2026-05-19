'use strict';

/**
 * Fetches problem data from LeetCode's public GraphQL API.
 * No auth required for public problems.
 */

const LC_GRAPHQL_URL = 'https://leetcode.com/graphql';
const LC_FETCH_TIMEOUT_MS = 10000; // 10 seconds
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 200;

const { info } = require('../utils/logger');
const { parse } = require('node-html-parser');

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

async function withRetry(fn, maxRetries = MAX_RETRIES, baseDelayMs = RETRY_DELAY_MS) {
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      // Don't retry on permanent errors
      if (err.message.includes('Problem not found') || err.message.includes('Invalid LeetCode URL')) {
        throw err;
      }
      if (attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt);
        info('leetcode', `retry ${attempt + 1}/${maxRetries} in ${delay}ms: ${err.message}`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
}

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

  return withRetry(async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), LC_FETCH_TIMEOUT_MS);

    let response;
    try {
      response = await fetch(LC_GRAPHQL_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: QUERY,
          variables: { titleSlug: slug },
        }),
        signal: controller.signal,
      });
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new Error(`LeetCode API request timed out after ${LC_FETCH_TIMEOUT_MS / 1000}s`);
      }
      throw new Error(`Network error fetching LC problem: ${err.message}`);
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      // Retry on 429 (rate limit) or 5xx (server error)
      if (response.status === 429 || response.status >= 500) {
        throw new Error(`LC API returned ${response.status} — retrying`);
      }
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
  });
}

function toSuperscript(text) {
  const map = {
    '0':'⁰','1':'¹','2':'²','3':'³','4':'⁴',
    '5':'⁵','6':'⁶','7':'⁷','8':'⁸','9':'⁹',
    '+':'⁺','-':'⁻','n':'ⁿ'
  };
  return text.split('').map(c => map[c] ?? c).join('');
}

function walkNode(node) {
  // Text node — emit as-is
  if (node.nodeType === 3) {
    return node.rawText
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&nbsp;/g, ' ')
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"');
  }

  const tag = node.tagName?.toLowerCase();
  const children = node.childNodes.map(walkNode).join('');

  switch (tag) {
    case 'strong': {
      const trimmed = children.trim();
      const trailingSpace = children.endsWith(' ') ? ' ' : '';
      return `**${trimmed}**${trailingSpace}`;
    };
    case 'em':     return `_${children.trim()}_`;
    case 'code':   return `\`${children}\``;
    case 'sup':    return toSuperscript(children);
    case 'sub':    return children;
    case 'p':      return `${children}\n`;
    case 'br':     return '\n';
    case 'li':     return `\n- ${children.trim()}`;
    case 'ul':
    case 'ol':     return `${children}\n`;
    case 'pre': {
      const cleaned = children.replace(/^`|`$/g, '').trim();
      return '\n```\n' + cleaned + '\n```\n';
    }
    default:       return children;
  }
}

/**
 * Convert LeetCode HTML content to clean Markdown.
 * Uses a proper HTML tree walk instead of regex chaining,
 * so tag context (open/close, nesting) is never ambiguous.
 *
 * @param {string} html - Raw HTML from LeetCode `content` field.
 * @returns {string} Clean Markdown string.
 */
function stripHtml(html) {
  if (!html) return '';
  const root = parse(html);

  return root.childNodes
    .map(walkNode)
    .join('')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
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
