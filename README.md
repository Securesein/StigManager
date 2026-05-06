# STIG Manager

Desktop app for managing, annotating and comparing DISA STIGs across versions.
Runs fully local — no cloud, no telemetry.

## Features

- Import STIG files (XML/XCCDF)
- Organize STIGs by use case and platform
- Annotate rules with status, notes and optional expiry timer
- Compare versions — automatically carry over annotations with confidence-based matching
- Export to CSV (DISA column format + annotations) or JSON backup
- Database backup and restore

## Installation (end users)

Download the latest `.dmg` from the [Releases](../../releases) page.

**First launch on macOS:** right-click the app in Applications → **Open** → **Open**.
This is required once because the app is not notarized.

## Development

### Requirements

- Node.js 20+
- npm 10+

### Setup

```bash
npm install --ignore-scripts
node node_modules/electron/install.js
npx @electron/rebuild -f -w better-sqlite3
```

> `better-sqlite3` is a native module that must be compiled for Electron's internal Node version.
> `--ignore-scripts` prevents it from compiling for the wrong version during install.
> The last two steps download Electron and rebuild the module correctly.

### Run

```bash
npm run dev
```

Starts Vite (renderer) and Electron simultaneously. Electron waits for the dev server to be available.

### Build

```bash
npm run build
```

Produces `.dmg` files (macOS) in the `release/` directory.

## Project structure

```
STIG/
├── main/
│   ├── index.js      # Electron main process
│   ├── preload.js    # Secure IPC bridge to renderer
│   ├── ipc.js        # IPC handlers
│   ├── db.js         # SQLite schema + query helpers
│   ├── parser.js     # XML/XCCDF import + metadata detection
│   └── matcher.js    # Layered version-matching algorithm
├── renderer/
│   ├── index.html
│   ├── index.css     # Tailwind entry
│   ├── main.jsx      # React entry point
│   ├── pages/        # Dashboard, RuleList, RuleDetail, VersionCompare
│   └── components/   # Sidebar, RuleRow, TimerBadge
├── shared/
│   └── constants.js  # Confidence thresholds, status enums
├── package.json
├── vite.config.js
├── tailwind.config.js
├── postcss.config.js
└── electron-builder.yml
```

## Matching algorithm

When importing a new STIG version, the matcher automatically compares it against a selected previous version:

| Layer | Method         | Confidence |
|-------|---------------|-----------|
| 1     | Exact Vuln-ID  | 1.00      |
| 2     | Exact STIG-ID  | 0.95      |
| 3     | Exact title    | 0.85      |
| 4     | Fuzzy title    | variable  |
| 5     | No match       | 0.00      |

Annotations are automatically carried over at confidence ≥ 0.85.
Between 0.75–0.85 they are flagged for manual review in the Version Comparison screen.
