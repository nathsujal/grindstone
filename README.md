# Grindstone

A persistent DSA (Data Structures & Algorithms) workstation layout manager for VS Code. Built for competitive programmers and developers practicing LeetCode-style problems.

![Version](https://img.shields.io/badge/version-2.0.0-blue)
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

- **Column 1**: Problem description (PROBLEM.md)
- **Column 2**: Input test cases (input.txt)
- **Column 3**: Program output (output.txt)
- **Column 4**: Solution files as tabs (solution.py, solution.cpp, solution.rs)

Test cases are automatically synced from PROBLEM.md to input.txt when you open a problem.

### 2. Create Problems from LeetCode

Run `DSA: New Problem` (Cmd+Shift+N) and:
1. Select a topic folder (e.g., 01_Arrays, 02_LinkedLists)
2. Paste a LeetCode problem URL
3. Confirm the preview

Grindstone fetches the problem via LeetCode's GraphQL API and creates:
- `PROBLEM.md` - Full problem description with examples
- `solution.py` - Python starter template
- `solution.cpp` - C++ starter template
- `solution.rs` - Rust starter template

The problem is automatically added to TRACKER.md with Todo status and today's date.

### 3. Run Your Solutions

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

### 4. Delete Problems (Auto-Renumber)

Run `DSA: Delete Problem` (Cmd+Shift+D):
- Delete single problems or entire topics
- Remaining problems are automatically renumbered
- TRACKER.md is updated (deleted rows struck through)
- Markdown links across the workspace are updated
- If the deleted problem was open, layout is cleared or reopened

### 5. Smart Link Indexing

Grindstone maintains a `_progress/LINK_INDEX.md` file that tracks which markdown files reference which problems. This enables:
- Fast updates when renaming/deleting problems
- Only affected files are scanned (not entire workspace)
- File watcher keeps index fresh automatically

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
│   ├── TRACKER.md
│   └── LINK_INDEX.md
├── input.txt
└── output.txt
```

### Special Folders

| Folder | Purpose |
|--------|---------|
| `_progress/` | System files (TRACKER.md, LINK_INDEX.md) |
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

## How It Works

### Extension Boot

```
activate()
├── ensureIndex()       ← Load or build LINK_INDEX.md
├── startWatcher()      ← Monitor file changes
└── registerCommands()  ← Register 6 commands
```

### Link Index System

1. **On activate**: Load index from disk if fresh, else rebuild
2. **On command**: Always check freshness before executing
3. **On file change**: File watcher triggers incremental re-index
4. **On deactivate**: Flush any pending writes to disk

The index tracks: `{ "topic/problem": ["referencing_file.md", ...] }`

### Layout Opening

```
openLayout(problemDir)
├── syncTestCasesToInput()     ← PROBLEM.md → input.txt
├── clearLayout()              ← Reset to single pane
├── setEditorLayout(4-pane)    ← Create column structure
└── open files in columns      ← PROBLEM.md, input, output, solutions
```

### Problem Creation Flow

```
cmdNewProblem()
├── pickTopic()                ← QuickPick: 01_Arrays, 02_Strings, ...
├── showInputBox()             ← Paste LeetCode URL
├── fetchLeetCodeProblem()     ← GraphQL API call
├── previewAndConfirm()        ← Show: title, difficulty, tags
├── createProblemFiles()       ← Generate PROBLEM.md, solutions
├── appendTrackerRow()         ← Add to TRACKER.md
├── onProblemCreated()         ← Update LINK_INDEX
└── openLayout()               ← Open the new problem
```

### Deletion with Renumbering

```
cmdDeleteProblem()
├── pickTopic()                ← Which topic?
├── pickProblem()              ← Which problem(s)?
├── confirmDelete()            ← Yes/No confirmation
├── scanProblemsInTopic()      ← Get remaining problems
├── for each remaining:
│   ├── rename(oldPath, newPath)
│   ├── updateLinksAcrossWorkspace()
│   ├── updateTrackerRow()
│   └── onProblemRenamed()
└── strikeTrackerRow()         ← Mark deleted row
```

## Configuration

No configuration required. Grindstone works out of the box with sensible defaults.

Future configuration options (planned):
- Custom topic folder names
- Additional solution file types
- Layout preferences

## Troubleshooting

### "No workspace found"

Grindstone requires an open workspace folder. Open your DSA folder in VS Code first.

### "No topic folders found"

Create at least one topic folder with naming convention `NN_TopicName`:
- `01_Arrays`
- `02_LinkedLists`
- `03_Hashing`

### "Failed to fetch problem data"

Check your internet connection. Grindstone fetches from LeetCode's GraphQL API.

### "Compile failed" / "Runtime error"

Check output.txt in Column 3 for error details. Common issues:
- Python: Missing `python3` in PATH
- C++: Missing `g++` compiler
- Rust: Missing `rustc` compiler

## Development

### Project Structure

```
src/
├── extension.js          ← Entry point, registers all commands
├── features/
│   ├── problem-picker.js  ← Open problem commands
│   ├── new-problem.js    ← Create from LeetCode
│   ├── delete-problem.js← Delete with renumbering
│   ├── clear-layout.js   ← Reset workspace
│   └── run-solution.js   ← Execute solution files
├── services/
│   ├── leetcode.js       ← LeetCode GraphQL fetcher
│   ├── link-index.js     ← Markdown link tracking
│   └── index-watcher.js  ← File system watcher
├── ui/
│   ├── layout.js         ← 4-pane layout management
│   └── picker.js         ← QuickPick helpers
└── utils/
    ├── workspace.js      ← Workspace scanning
    ├── fs-utils.js       ← File operations
    ├── tracker.js        ← TRACKER.md updates
    ├── lc-mapper.js      ← LeetCode → file mappers
    ├── testcase-sync.js  ← PROBLEM.md → input.txt
    └── ...
```

### Running Tests

```bash
# Run extension in development mode
F5 (in VS Code)

# Run lint
npm run lint
```

## License

MIT

## Contributing

Contributions welcome! Please open an issue to discuss features or bugs before submitting PRs.

---

Built with 💻 for competitive programmers