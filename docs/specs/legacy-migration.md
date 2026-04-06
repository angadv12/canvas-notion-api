# Legacy Migration Spec

## Current Legacy Shape

The legacy script creates one database per course and only inserts new rows based on URL existence checks.

## v2 Migration Strategy

- Do not attempt an in-place destructive migration of legacy per-course databases.
- Provision a fresh unified database for v2 or attach to an already-v2 database.
- Backfill the v2 database from Canvas using the new sync engine.
- Leave legacy per-course databases untouched so users can compare results before cleanup.

## Why This Strategy

- The new identity model is `courseId:itemType:canvasId`, not URL-only.
- The new schema introduces internal sync metadata fields.
- A fresh database avoids risky rewrites of manually edited legacy databases.

## Manual Cleanup After Backfill

After a successful v2 backfill, users can:

1. keep legacy course databases as historical snapshots
2. archive the legacy databases manually in Notion
3. switch any dashboards or linked views to the unified v2 database
