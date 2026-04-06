# Canvas to Notion CLI

Sync Canvas assignments and discussion topics into a single Notion database with create, update, archive, and restore behavior.

The Notion integration now targets API version `2026-03-11` through `@notionhq/client` `5.16.0` and uses the post-`2025-09-03` data source model.

## What Changed In v2

- The sync is now delta-based instead of insert-only.
- Assignment title and due-date changes update the existing Notion record instead of creating drift.
- Removed Canvas items are archived in Notion for in-scope courses.
- The project now has CLI commands for setup, sync, and diagnostics.
- Configuration is stored in `.canvas-notion/config.json` locally or in a global config path instead of mutating `src/.env`.

## Install

### Local repo usage

```bash
npm install
node ./bin/canvas-notion.js setup
node ./bin/canvas-notion.js sync
```

### npm-style usage

```bash
npx canvas-notion setup
npx canvas-notion sync
```

The package name may still change before publishing, but the CLI command is `canvas-notion`.

## Commands

### `setup`

Interactive setup that stores your Canvas URL, Canvas token, Notion token, and target Notion database.

```bash
canvas-notion setup
canvas-notion setup --global
canvas-notion setup --canvas-url https://canvas.example.edu --canvas-token <token> --notion-token <token> --parent-url <notion-page-url>
```

`setup` validates both APIs and either:

- attaches to an existing v2-compatible database with `--database-url`, or
- creates a fresh `Canvas Assignments` database under `--parent-url`.

### `sync`

Run the sync engine.

```bash
canvas-notion sync
canvas-notion sync --dry-run
canvas-notion sync --scope all-active
canvas-notion sync --course "Database Systems"
canvas-notion sync --course 12345,67890
```

Behavior:

- creates new rows for unseen Canvas items
- updates sync-managed fields when Canvas changes
- restores previously archived rows if the same Canvas item returns
- archives rows missing from Canvas for the courses included in the current sync scope
- leaves the `Completion` checkbox untouched

### `doctor`

Validate config, Canvas access, Notion access, and the target database schema.

```bash
canvas-notion doctor
```

## Config

Project-local config lives at:

```text
.canvas-notion/config.json
```

Global config lives at:

- macOS: `~/Library/Application Support/canvas-notion/config.json`
- Linux: `~/.config/canvas-notion/config.json`
- Windows: `%APPDATA%/canvas-notion/config.json`

Precedence is:

1. CLI flags
2. Environment variables
3. Project config
4. Global config

Legacy `.env` loading still works for compatibility. The loader checks both `.env` and `src/.env`.

## Environment Variables

These can override stored config:

```text
CANVAS_NOTION_CANVAS_URL
CANVAS_NOTION_CANVAS_TOKEN
CANVAS_NOTION_NOTION_TOKEN
CANVAS_NOTION_NOTION_PAGE
CANVAS_NOTION_NOTION_DATABASE
CANVAS_NOTION_SCOPE
CANVAS_NOTION_INCLUDE_DISCUSSIONS
CANVAS_NOTION_CANVAS_CONCURRENCY
CANVAS_NOTION_NOTION_CONCURRENCY
CANVAS_NOTION_NOTION_WRITE_DELAY_MS
CANVAS_NOTION_TIMEOUT_MS
CANVAS_NOTION_MAX_RETRIES
```

Legacy names still accepted:

```text
CANVAS_API_URL
CANVAS_API
NOTION_API
NOTION_PAGE
NOTION_DATABASE
```

## Required Notion Schema

The CLI-created database uses these properties:

- `Assignment Name`
- `Course`
- `Course ID`
- `Canvas ID`
- `Item Type`
- `URL`
- `Due Date`
- `Canvas Updated At`
- `Source Key`
- `Source Signature`
- `Completion`

## Troubleshooting

- `sync --dry-run` is the safest first run because it prints planned creates, updates, restores, and archives.
- `doctor` is the fastest way to catch invalid tokens or a broken database schema.
- Runtime is logged by phase so it is easier to tell whether Canvas fetches or Notion writes are the bottleneck.
- Notion writes now run through the post-`2025-09-03` data source APIs with rate-limited concurrency instead of fully serial page creation.

## Specs

Implementation specs live in:

- `docs/specs/sync-engine.md`
- `docs/specs/cli-setup.md`
- `docs/specs/legacy-migration.md`
