# Grindstone

![Grindstone Icon](icon.png)

A persistent DSA (Data Structures & Algorithms) workstation layout manager for VS Code. Built for competitive programmers and developers practicing LeetCode-style problems.

![Version](https://img.shields.io/badge/version-3.0.0-blue)
![VS Code](https://img.shields.io/badge/VS%20Code-%3E%3D1.74.0-green)

## Why Grindstone?

Managing a DSA practice workspace manually is tedious:
- Opening 4+ files every time you work on a problem
- Switching between topics and problems
- Keeping track of test cases and outputs
- Renumbering problems when you delete one

Grindstone automates all of this. Just press a keybinding, and you have a complete DSA workbench ready.

## Features

### 1. Persistent 4-Pane Layout

Opens a standardized workbench for every problem:

```
┌──────────────────────┬───────────────────────────────────┐
│                      │  [solution.py][.cpp][.rs] ← tabs  │
│     PROBLEM.md       │                                   │
│     (Col 1 top)      │     active solution file          │
│                      │     (Col 4)                       │
├───────────┬──────────┤                                   │
│ input.txt │output.txt│                                   │
│ (Col 2)   │ (Col 3)  │                                   │
└───────────┴──────────┴───────────────────────────────────┘
```

- **Column 1**: Problem description (PROBLEM.md) — optionally as rendered Markdown preview
- **Column 2**: Input test cases (input.txt)
- **Column 3**: Program output (output.txt)
- **Column 4**: Solution files as tabs (solution.py, solution.cpp, solution.rs)

Test cases are automatically synced from PROBLEM.md to input.txt when you open a problem.

### 2. Markdown Preview (Optional)

Enable `grindstone.openProblemAsPreview` in VS Code settings to open PROBLEM.md as a rendered Markdown preview instead of a raw text editor. The text editor opens behind the preview, so closing the preview automatically reveals the editable version.

### 3. Create Problems from LeetCode

Run `DSA: New Problem` (Cmd+Shift+N) and:
1. Select a topic folder (e.g., 01_Arrays, 02_LinkedLists)
2. Paste a LeetCode problem URL
3. Confirm the preview

Grindstone fetches the problem via LeetCode's GraphQL API (with retry and timeout handling) and creates:
- `PROBLEM.md` - Full problem description with examples
- `solution.py` - Python starter template
- `solution.cpp` - C++ starter template
- `solution.rs` - Rust starter template

### 4. Run Your Solutions

Run `DSA: Run Solution` (Cmd+Shift+R):
- Automatically detects which problem is open
- Lets you pick which solution file to run
- Compiles C++/Rust, runs Python
- Writes output to output.txt and shows it in Column 3

Supported languages:
| Language | File | Build | Run Command |
|----------|------|-------|-------------|
| Python | solution.py | None | `python3` |
| C++ | solution.cpp | g++ -std=c++17 | Compiled binary |
| Rust | solution.rs | rustc | Compiled binary |

### 5. Delete Problems (Auto-Renumber)

Run `DSA: Delete Problem` (Cmd+Shift+D):
- Delete single problems or entire topics
- Remaining problems are automatically renumbered
- If the deleted problem was open, layout is cleared or reopened

## Installation

### From VSIX (Recommended)

1. Download the latest `.vsix` file from releases
2. Open VS Code
3. Extensions panel → ⋮ menu → "Install from VSIX..."
4. Select the downloaded file

### From Source

```bash
# Clone and install dependencies
npm install

# Package as VSIX
npx vsce package

# Install locally
code --install-extension grindstone-*.vsix
```

## Workspace Structure

Your DSA workspace should look like:

```
DSA/
├── 01_Arrays/
│   ├── 001_two_sum/
│   │   ├── PROBLEM.md
│   │   ├── solution.py
│   │   ├── solution.cpp
│   │   └── solution.rs
│   ├── 002_max_subarray/
│   │   └── ...
│   └── NOTES.md
├── 02_LinkedLists/
│   └── ...
├── _progress/
│   └── link-index.json    ← (legacy, safe to delete)
├── input.txt
└── output.txt
```

### Special Folders

| Folder | Purpose |
|--------|---------|
| `_progress/` | Legacy system files (safe to delete if present) |
| `_templates/` | Future: custom problem templates |
| Topic folders (e.g., `01_Arrays/`) | Group problems by topic |

### Problem Folder Naming

Problems follow the pattern: `{number}_{slug}`

Examples:
- `001_two_sum`
- `042_trapping_rain_water`
- `300_longest_increasing_subsequence`

Numbering is automatic based on existing problems in the topic.

## Keybindings

| Action | macOS | Linux/Windows |
|--------|-------|---------------|
| Open Problem | Cmd+Alt+O | Ctrl+Alt+O |
| New Problem | Cmd+Shift+N | Ctrl+Shift+N |
| Delete Problem | Cmd+Shift+D | Ctrl+Shift+D |
| Clear Layout | Cmd+Shift+C | Ctrl+Shift+C |
| Run Solution | Cmd+Shift+R | Ctrl+Shift+R |

## Commands

All commands are available via:
- **Command Palette**: Search "DSA:"
- **Explorer context menu**: Right-click any folder → "DSA: Open Problem Path"

| Command | Description |
|---------|-------------|
| `DSA: Open Problem Layout` | Open a problem via QuickPick |
| `DSA: Open Problem Path` | Open a problem from right-click menu |
| `DSA: New Problem` | Create new problem from LeetCode URL |
| `DSA: Delete Problem` | Delete problem(s) with renumbering |
| `DSA: Clear Layout` | Close all editors, reset to single pane |
| `DSA: Run Solution` | Run the active solution file |

## Configuration

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `grindstone.openProblemAsPreview` | boolean | `false` | Open PROBLEM.md as rendered Markdown preview |

## How It Works

### Extension Boot

```
activate()
├── loadState()           ← Restore last opened problem, problem count
├── registerCommands()    ← Register commands with lazy loading
└── registerLogger()      ← Structured logging (info, warn, error)
```

### Layout Opening

```
openLayout(problemDir)
├── syncTestCasesToInput()     ← PROBLEM.md → input.txt
├── clearLayout()              ← Reset to single pane
├── setEditorLayout(4-pane)    ← Create column structure
├── open PROBLEM.md            ← Text editor or Markdown preview
├── open input.txt             ← Column 2
├── open output.txt            ← Column 3
└── open solution files        ← Column 4 (tabs)
```

### Problem Creation Flow

```
cmdNewProblem()
├── pickTopic()                ← QuickPick: 01_Arrays, 02_Strings, ...
├── promptLeetCodeUrl()        ← Input box with URL validation
├── fetchLeetCodeProblem()     ← GraphQL API (retry + timeout)
├── previewAndConfirm()        ← Show: title, difficulty, tags
├── createProblemFiles()       ← Generate PROBLEM.md, solutions
└── openLayout()               ← Open the new problem
```

### Deletion with Renumbering

```
cmdDeleteProblem()
├── pickTopic()                ← Which topic?
├── pickProblem()              ← Which problem(s)?
├── confirmDelete()            ← Yes/No confirmation
├── deleteSingleProblem()      ← Delete and renumber remaining
│   └── for each remaining:
│       └── rename(oldPath, newPath)
└── clear or reopen layout     ← If deleted problem was open
```

## Development

### Project Structure

```
src/
├── extension.js              ← Entry point, lazy command registration
├── constants.js              ← Global constants
├── constants/
│   └── layout.js             ← Layout-specific constants
├── features/
│   ├── problem-picker.js     ← Open problem commands
│   ├── new-problem.js        ← Create from LeetCode
│   ├── delete-problem.js     ← Delete with renumbering
│   ├── clear-layout.js       ← Reset workspace
│   └── run-solution.js       ← Execute solution files
├── services/
│   ├── leetcode.js           ← LeetCode GraphQL fetcher (retry + timeout)
│   └── problem-creator.js    ← Problem folder and file creation
├── ui/
│   ├── layout.js             ← 4-pane layout management
│   └── picker.js             ← QuickPick helpers
└── utils/
    ├── async.js              ← Async utilities (withTimeout, pollUntil)
    ├── fs-utils.js           ← Core file operations
    ├── lc-mapper.js          ← LeetCode → file mappers
    ├── logger.js             ← Structured logging
    ├── state.js              ← Persistent state (VS Code Memento)
    ├── tab-utils.js          ← Tab detection utilities
    ├── testcase-sync.js      ← PROBLEM.md → input.txt sync
    └── workspace.js          ← Workspace scanning utilities
```

### Running Tests

```bash
# Run extension in development mode
F5 (in VS Code)

# Run lint
npm run lint

# Fix lint issues
npm run lint:fix

# Format code
npm run format

# Run tests
npm run test

# Watch tests
npm run test:watch
```

### Tooling

| Tool | Purpose |
|------|---------|
| ESLint | Code quality and style enforcement |
| Prettier | Automatic code formatting |
| Vitest | Unit testing framework |

## Troubleshooting

### "No workspace found"

Grindstone requires an open workspace folder. Open your DSA folder in VS Code first.

### "No topic folders found"

Create at least one topic folder with naming convention `NN_TopicName`:
- `01_Arrays`
- `02_LinkedLists`
- `03_Hashing`

### "Failed to fetch problem data"

Check your internet connection. Grindstone fetches from LeetCode's GraphQL API with automatic retry (2 attempts, exponential backoff) and 10s timeout.

### "Compile failed" / "Runtime error"

Check output.txt in Column 3 for error details. Common issues:
- Python: Missing `python3` in PATH
- C++: Missing `g++` compiler
- Rust: Missing `rustc` compiler

## Changelog

### v3.0.0 (Current)
- **Added**: Markdown preview option for PROBLEM.md (`grindstone.openProblemAsPreview`)
- **Added**: Structured logging system
- **Added**: Persistent state management (VS Code Memento)
- **Added**: Retry logic for LeetCode API calls
- **Added**: Timeouts for compile/run operations
- **Added**: ESLint, Prettier, Vitest tooling
- **Added**: Unit tests (21 tests across 4 files)
- **Added**: Lazy module loading for faster activation
- **Changed**: Keybinding for Open Problem: Cmd+Shift+O → Cmd+Alt+O (conflict resolution)
- **Changed**: Replaced regex HTML parsing with node-html-parser
- **Changed**: Simplified PROBLEM.md and solution templates
- **Changed**: Replaced sleep() with deterministic pollUntil() polling
- **Removed**: Link-index system (LINK_INDEX.md, index-watcher)
- **Removed**: Tracker system (TRACKER.md)
- **Removed**: Markdown updater (md-updater)
- **Removed**: Dead code (defaults.js, extract.js, unused exports)

## License

MIT

## Contributing

Contributions welcome! Please open an issue to discuss features or bugs before submitting PRs.

---

Built with 💻 for competitive programmers
