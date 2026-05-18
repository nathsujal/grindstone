# Grindstone — Project Context

<!-- gitnexus:start -->
## GitNexus — Code Intelligence

This project is indexed by GitNexus as **grindstone** (572 symbols, 913 relationships, 41 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

### Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

### Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

### Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/grindstone/context` | Codebase overview, check index freshness |
| `gitnexus://repo/grindstone/clusters` | All functional areas |
| `gitnexus://repo/grindstone/processes` | All execution flows |
| `gitnexus://repo/grindstone/process/{name}` | Step-by-step execution trace |
<!-- gitnexus:end -->

---

## Project Identity

Grindstone is a VS Code extension (~15 files, Node.js CommonJS, no bundler).
Primary stack: VS Code API, Node.js `fs`, child_process, native `fetch`.

---

## Quality Tiers

### Tier 1 — always enforced (correctness, safety)
These are defects or fragility. No code ships that violates these.

- **DRY**: open-tab detection, folder-name building, and number-parsing must not be duplicated. One canonical function each.
- **Null safety**: all VS Code tab access uses `t?.input?.uri?.fsPath`. No bare `.input.uri`.
- **No double side effects**: `clearLayout()` is called once per operation — never by both the orchestrator and the sub-function.
- **Fail-fast + rollback**: if file creation fails mid-operation, delete the partial folder before surfacing the error.
- **Dead code**: unused exports (`updateMarkdownReferences`, `askProblemName`, `getNextProblemNumber`, `createProblemFolder`) are removed, not left in place.
- **Defensive input validation**: `openLayout(problemDir)` validates the path ends in a `\d+_slug` segment before proceeding.
- **Resource cleanup**: `flushIndex()` calls `clearTimeout(_timer)` unconditionally, not conditionally on `_dirty`.
- **Proper error handling**: errors propagate up or surface to the user via `vscode.window.showErrorMessage`. Silent swallowing is never acceptable.

### Tier 2 — enforced during build + review (structure, maintainability)
Applied when writing new code or touching existing files.

- **SRP**: `fs-utils.js` is a grab-bag — new code must not add to it. New file I/O goes in `fs-core.js`, markdown scanning in `md-scanner.js`.
- **Centralized config**: language runner config lives in `constants.js` or `language-config.js`, not inline in feature files.
- **Consistent return contracts**: utils return `null | T` for queries, throw for unexpected errors, `void` for commands.
- **Immutable index mutations**: build a new array instead of `splice()`-ing in place.
- **Normalized index keys**: always use `toIndexKey(absPath, root)` helper — never inline `path.relative + .split(path.sep).join('/')`.
- **No god functions**: functions over ~40 lines get split. Named sub-functions, not inline comments.
- **KISS on regex**: one heading pattern (`## Test Cases`), fenced blocks only, no raw-text fallback.
- **Single source of truth for `today()`**: injected as a parameter to pure builder functions, not called inside them.

### Tier 3 — enforced during review phase only (quality-of-life)
- JSDoc on all exported functions (`@param`, `@returns`, `@throws`).
- `// @ts-check` header on files with complex types.
- Lazy `require()` inside command handlers (not at module top).
- `AbortController` timeout (10s) on all network calls.
- Workspace-unique tmp paths for compiled binaries (not `/tmp/dsa_sol_cpp`).
- Unused dependencies (`turndown`, possibly `node-fetch`) removed from `package.json`.

---

## Phase Structure

Every task follows phases. Switch agents in OpenCode using **Tab** or `@mention`:

| Phase | Agent | Invoke with | What happens |
|-------|-------|-------------|--------------|
| Plan | `plan` | Tab or `@plan` | Explore, design, get approval — no code written |
| Build | `build` | Tab or `@build` | Implement step by step, Tier 1+2 enforced |
| Review | `review` | Tab or `@review` | Full audit against all tiers, SHIP/NO-SHIP verdict |
| Debug | `debug` | Tab or `@debug` | Trace root cause, minimal fix, no opportunistic refactoring |
| Architecture | `/architecture-review` | Slash command | Structural assessment, run before major direction changes |

Never jump from Plan to Build without explicit user sign-off.
Never mark a task complete without running the Review agent.