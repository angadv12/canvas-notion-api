#!/usr/bin/env node
const { loadConfig } = require('./config')
const { createStateFromPages, createTrackedItem, loadState, saveState } = require('./state')
const { CanvasProvider } = require('./canvas')
const { NotionProvider } = require('./notion')
const { runSync } = require('./sync')
const { runSetup } = require('./setup')
const { runDoctor } = require('./doctor')
const { DEFAULT_CONFIG } = require('./constants')
const { toBoolean } = require('./utils')

async function runCli(argv = process.argv.slice(2), context = {}) {
  const cwd = context.cwd || process.cwd()
  const { command, flags } = parseArgv(argv)

  if (!command || flags.help) {
    printHelp()
    return
  }

  const { config, activeScope } = loadConfig({ cwd, flags })
  const scope = flags.global ? 'global' : activeScope

  if (command === 'setup') {
    await runSetup({
      cwd,
      config,
      scope,
      flags,
      logger: context.logger || console
    })
    return
  }

  if (command === 'doctor') {
    await runDoctor({
      config,
      logger: context.logger || console
    })
    return
  }

  if (command === 'sync') {
    const normalizedConfig = normalizeSyncConfig(config)
    const state = loadState({ cwd, scope })
    const stateStore = {
      state,
      trackPage(sourceKey, pageId, archived, item = {}) {
        state.items[sourceKey] = createTrackedItem({
          sourceKey,
          pageId,
          archived,
          courseId: item.courseId,
          sourceSignature: item.sourceSignature
        })
      },
      replacePages(databaseId, pages) {
        const nextState = createStateFromPages(databaseId, pages)
        state.version = nextState.version
        state.databaseId = nextState.databaseId
        state.items = nextState.items
      },
      save() {
        saveState({ cwd, scope, state })
      }
    }

    await runSync({
      config: normalizedConfig,
      canvasProvider: new CanvasProvider(normalizedConfig),
      notionProvider: new NotionProvider(normalizedConfig),
      stateStore,
      logger: context.logger || console,
      options: {
        dryRun: toBoolean(flags.dryRun, false),
        reconcile: toBoolean(flags.reconcile, false),
        scope: flags.scope,
        courseFilter: arrayify(flags.course),
        includeDiscussions: flags.includeDiscussions === undefined
          ? undefined
          : toBoolean(flags.includeDiscussions, true)
      }
    })
    return
  }

  throw new Error(`Unknown command "${command}". Run with --help for usage.`)
}

function normalizeSyncConfig(config) {
  return {
    ...DEFAULT_CONFIG,
    ...config,
    canvas: { ...DEFAULT_CONFIG.canvas, ...config.canvas },
    notion: { ...DEFAULT_CONFIG.notion, ...config.notion },
    sync: { ...DEFAULT_CONFIG.sync, ...config.sync }
  }
}

function parseArgv(argv) {
  const positionals = []
  const flags = {}

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (!arg.startsWith('--')) {
      positionals.push(arg)
      continue
    }

    const [rawKey, rawValue] = arg.slice(2).split('=')
    const key = camelCase(rawKey)
    const next = rawValue !== undefined ? rawValue : argv[index + 1]

    if (rawValue !== undefined) {
      flags[key] = rawValue
      continue
    }

    if (next && !next.startsWith('--')) {
      flags[key] = next
      index += 1
      continue
    }

    flags[key] = true
  }

  return {
    command: positionals[0],
    flags,
    positionals: positionals.slice(1)
  }
}

function camelCase(value) {
  return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())
}

function arrayify(value) {
  if (value === undefined || value === null || value === '') return []
  return String(value)
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
}

function printHelp() {
  console.log(`canvas-notion

Usage:
  canvas-notion setup [--global]
  canvas-notion sync [--dry-run] [--reconcile] [--scope latest-term|all-active] [--course <name-or-id>]
  canvas-notion doctor

Key flags:
  --canvas-url <url>
  --canvas-token <token>
  --notion-token <token>
  --parent-url <url>
  --database-url <url>
  --database-title <title>
  --reconcile
  --include-discussions <true|false>
  --notion-write-concurrency <number>
  --request-timeout-ms <number>
  --global
`)
}

module.exports = {
  runCli,
  parseArgv
}
