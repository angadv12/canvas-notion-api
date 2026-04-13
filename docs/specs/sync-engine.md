# Sync Engine Spec

## Goal

Provide a deterministic Canvas-to-Notion sync that can create, update, archive, and restore records without duplicates.

The Notion implementation target is API version `2026-03-11`.

## Canonical Source Model

Each Canvas item is normalized into a `CanvasWorkItem` with:

- `sourceKey`: `${courseId}:${itemType}:${canvasId}`
- `courseId`
- `courseName`
- `canvasId`
- `itemType`
- `title`
- `url`
- `dueStart`
- `dueEnd`
- `canvasUpdatedAt`
- `sourceSignature`

`sourceSignature` is a SHA-256 hash over the sync-managed fields. The signature is used to skip unchanged items quickly.

## Sync-Managed Fields

The sync owns these Notion properties:

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

The sync must never overwrite `Completion`.

## Diff Rules

1. Fetch all in-scope courses from Canvas.
2. Fetch assignments and, when enabled, discussion topics for those courses.
3. Normalize all Canvas items and build a `Map<sourceKey, item>`.
4. Query the Notion database once and build a `Map<sourceKey, page>`.
5. Load the local state manifest for archived-page restoration.
6. Compute:
   - `create`: source key missing from active Notion pages and not tracked as archived
   - `update`: source key exists and signature changed
   - `restore`: source key missing from active Notion pages but present in state as archived
   - `archive`: Notion page exists for an in-scope course but source key is missing from the latest Canvas dataset

## Scope Rules

- The default scope is `latest-term`.
- `all-active` is an explicit opt-in.
- Archival only applies to courses returned by the current sync scope.
- Records from old or out-of-scope courses remain untouched.

## Performance Rules

- Canvas fetches run concurrently with a bounded concurrency limit.
- Notion reads happen through `dataSources.query` once per sync run.
- Notion writes use `data_source_id` parents, `in_trash` for archival, bounded concurrency, and a global start-rate limiter instead of a fully serial loop.
- Notion writes are retried on timeout, conflict, transient server, and rate-limit failures.
- A no-op sync should produce zero Notion writes.

## Failure Handling

- Canvas and Notion calls use bounded retries with backoff and jitter.
- Failures must identify whether the error happened in Canvas fetch, Notion read, or Notion write.
- Sync output must include timing for course discovery, Canvas fetch, Notion read, diff, and Notion write.
