# CLI And Setup Spec

## Commands

### `canvas-notion setup`

Purpose:

- collect credentials
- validate Canvas access
- validate Notion access
- attach to an existing database or create a new one
- persist configuration

Supported flags:

- `--global`
- `--canvas-url`
- `--canvas-token`
- `--notion-token`
- `--parent-url`
- `--database-url`
- `--database-title`
- `--scope`
- `--include-discussions`

### `canvas-notion sync`

Purpose:

- run the sync engine against the configured database

Supported flags:

- `--dry-run`
- `--scope latest-term|all-active`
- `--course <name-or-id[,name-or-id]>`
- `--include-discussions`
- `--notion-write-concurrency`
- `--request-timeout-ms`

### `canvas-notion doctor`

Purpose:

- verify configuration presence
- verify Canvas API access
- verify Notion API access
- verify the target database schema

## Config Storage

Project mode:

- `.canvas-notion/config.json`
- `.canvas-notion/state.json`

Global mode:

- macOS: `~/Library/Application Support/canvas-notion/`
- Linux: `~/.config/canvas-notion/`
- Windows: `%APPDATA%/canvas-notion/`

## Config Precedence

1. CLI flags
2. Environment variables
3. Project config
4. Global config

## Validation Rules

- `setup` must reject missing Canvas URL, Canvas token, or Notion token.
- `setup` must reject runs that provide neither an attachable database nor a parent page for creation.
- `sync --dry-run` must not create a database implicitly.
- `doctor` must fail on a database that does not expose the required v2 property names and types.
