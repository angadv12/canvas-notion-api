const fs = require('fs')
const path = require('path')
const dotenv = require('dotenv')
const { DEFAULT_CONFIG } = require('./constants')
const { getPaths } = require('./paths')
const { deepMerge, extractNotionId, toBoolean, toNumber } = require('./utils')

function loadDotEnv(cwd) {
  const candidates = [path.join(cwd, '.env'), path.join(cwd, 'src', '.env')]
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      dotenv.config({ path: candidate, override: false })
    }
  }
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return null
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 })
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })
}

function readOptionalNotionId(value) {
  if (value === undefined || value === null) return undefined
  return extractNotionId(value)
}

function configFromEnv(env) {
  return {
    canvas: {
      baseUrl: env.CANVAS_NOTION_CANVAS_URL || env.CANVAS_API_URL,
      token: env.CANVAS_NOTION_CANVAS_TOKEN || env.CANVAS_API,
      courseScope: env.CANVAS_NOTION_SCOPE
    },
    notion: {
      token: env.CANVAS_NOTION_NOTION_TOKEN || env.NOTION_API,
      parentPageId: readOptionalNotionId(env.CANVAS_NOTION_NOTION_PAGE || env.NOTION_PAGE),
      databaseId: readOptionalNotionId(env.CANVAS_NOTION_NOTION_DATABASE || env.NOTION_DATABASE),
      databaseTitle: env.CANVAS_NOTION_DATABASE_TITLE
    },
    sync: {
      includeDiscussions: env.CANVAS_NOTION_INCLUDE_DISCUSSIONS !== undefined
        ? toBoolean(env.CANVAS_NOTION_INCLUDE_DISCUSSIONS, true)
        : undefined,
      canvasConcurrency: toNumber(env.CANVAS_NOTION_CANVAS_CONCURRENCY, undefined),
      notionWriteConcurrency: toNumber(env.CANVAS_NOTION_NOTION_CONCURRENCY, undefined),
      notionWriteDelayMs: toNumber(env.CANVAS_NOTION_NOTION_WRITE_DELAY_MS, undefined),
      requestTimeoutMs: toNumber(env.CANVAS_NOTION_TIMEOUT_MS, undefined),
      maxRetries: toNumber(env.CANVAS_NOTION_MAX_RETRIES, undefined)
    }
  }
}

function configFromFlags(flags) {
  return {
    canvas: {
      baseUrl: flags.canvasUrl,
      token: flags.canvasToken,
      courseScope: flags.scope
    },
    notion: {
      token: flags.notionToken,
      parentPageId: readOptionalNotionId(flags.parentUrl || flags.parentPageId),
      databaseId: readOptionalNotionId(flags.databaseUrl || flags.databaseId),
      databaseTitle: flags.databaseTitle
    },
    sync: {
      includeDiscussions: flags.includeDiscussions !== undefined
        ? toBoolean(flags.includeDiscussions, true)
        : undefined,
      canvasConcurrency: toNumber(flags.canvasConcurrency, undefined),
      notionWriteConcurrency: toNumber(flags.notionWriteConcurrency, undefined),
      notionWriteDelayMs: toNumber(flags.notionWriteDelayMs, undefined),
      requestTimeoutMs: toNumber(flags.requestTimeoutMs, undefined),
      maxRetries: toNumber(flags.maxRetries, undefined)
    }
  }
}

function normalizeConfig(config) {
  const merged = deepMerge(DEFAULT_CONFIG, config)
  merged.canvas.baseUrl = String(merged.canvas.baseUrl || '').replace(/\/+$/, '')
  merged.notion.parentPageId = extractNotionId(merged.notion.parentPageId)
  merged.notion.databaseId = extractNotionId(merged.notion.databaseId)
  return merged
}

function loadConfig({ cwd, flags = {}, env = process.env }) {
  loadDotEnv(cwd)
  const paths = getPaths(cwd)
  const globalConfig = readJson(paths.global.config) || {}
  const projectConfig = readJson(paths.project.config) || {}
  const activeScope = flags.global
    ? 'global'
    : fs.existsSync(paths.project.config)
      ? 'project'
      : fs.existsSync(paths.global.config)
        ? 'global'
        : 'project'

  const config = normalizeConfig(
    deepMerge(globalConfig, projectConfig, configFromEnv(env), configFromFlags(flags))
  )

  return {
    config,
    paths,
    activeScope,
    projectConfig,
    globalConfig
  }
}

function saveConfig({ cwd, scope, config }) {
  const paths = getPaths(cwd)
  const filePath = paths[scope].config
  writeJson(filePath, sanitizePersistedConfig(config))
  return filePath
}

function sanitizePersistedConfig(value) {
  if (Array.isArray(value)) {
    return value.map(sanitizePersistedConfig)
  }
  if (!value || typeof value !== 'object') {
    return value
  }

  const output = {}
  for (const [key, entry] of Object.entries(value)) {
    if (entry === undefined || entry === null || entry === '') {
      continue
    }
    if (typeof entry === 'object' && !Array.isArray(entry)) {
      const nested = sanitizePersistedConfig(entry)
      if (Object.keys(nested).length) {
        output[key] = nested
      }
      continue
    }
    output[key] = entry
  }
  return output
}

module.exports = {
  loadConfig,
  saveConfig,
  readJson,
  writeJson
}
