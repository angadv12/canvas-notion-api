const crypto = require('crypto')
const { URL } = require('url')

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function deepMerge(...objects) {
  const result = {}
  for (const object of objects) {
    mergeInto(result, object)
  }
  return result
}

function mergeInto(target, source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return target
  }
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined) continue
    if (isPlainObject(value)) {
      if (!isPlainObject(target[key])) {
        target[key] = {}
      }
      mergeInto(target[key], value)
      continue
    }
    target[key] = value
  }
  return target
}

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
}

async function withRetry(fn, options = {}) {
  const {
    retries = 3,
    baseDelayMs = 400,
    shouldRetry = () => true,
    label = 'operation'
  } = options

  let attempt = 0
  let lastError
  while (attempt <= retries) {
    try {
      return await fn(attempt)
    } catch (error) {
      lastError = error
      if (attempt === retries || !shouldRetry(error)) {
        throw lastError
      }
      const jitter = Math.floor(Math.random() * 150)
      await sleep(baseDelayMs * (2 ** attempt) + jitter)
      attempt += 1
    }
  }
  throw new Error(`${label} failed`)
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length)
  const concurrency = Math.max(1, Number(limit) || 1)
  let index = 0

  async function worker() {
    while (index < items.length) {
      const currentIndex = index
      index += 1
      results[currentIndex] = await mapper(items[currentIndex], currentIndex)
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length || 1) }, worker)
  await Promise.all(workers)
  return results
}

async function runRateLimitedTasks(items, options, worker) {
  const { concurrency = 1, minIntervalMs = 0 } = options || {}
  let nextStartAt = Date.now()
  let reservation = Promise.resolve()

  async function reserveSlot() {
    let release
    const previous = reservation
    reservation = new Promise((resolve) => {
      release = resolve
    })
    await previous
    const now = Date.now()
    const waitFor = Math.max(0, nextStartAt - now)
    nextStartAt = Math.max(now, nextStartAt) + minIntervalMs
    release()
    if (waitFor > 0) {
      await sleep(waitFor)
    }
  }

  return mapWithConcurrency(items, concurrency, async (item, index) => {
    await reserveSlot()
    return worker(item, index)
  })
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function hashObject(value) {
  return crypto.createHash('sha256').update(stableStringify(value)).digest('hex')
}

function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

function nowIso() {
  return new Date().toISOString()
}

function toBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback
  if (typeof value === 'boolean') return value
  const normalized = String(value).trim().toLowerCase()
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false
  return fallback
}

function toNumber(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function extractNotionId(input) {
  if (!input) return ''
  const raw = String(input).trim()
  const normalized = raw.replace(/-/g, '')
  if (/^[0-9a-fA-F]{32}$/.test(normalized)) {
    return hyphenateNotionId(normalized)
  }

  const idPattern = /[0-9a-fA-F]{8}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{12}|[0-9a-fA-F]{32}/

  try {
    const url = new URL(raw)
    const combined = `${url.pathname}${url.search}`
    const urlMatch = combined.match(idPattern)
    return urlMatch ? hyphenateNotionId(urlMatch[0]) : ''
  } catch {
    const rawMatch = raw.match(idPattern)
    return rawMatch ? hyphenateNotionId(rawMatch[0]) : ''
  }
}

function hyphenateNotionId(value) {
  const clean = value.replace(/-/g, '')
  if (clean.length !== 32) return value
  return [
    clean.slice(0, 8),
    clean.slice(8, 12),
    clean.slice(12, 16),
    clean.slice(16, 20),
    clean.slice(20)
  ].join('-')
}

function textPropertyValue(input) {
  const content = String(input ?? '').slice(0, 2000)
  return {
    rich_text: content
      ? [{ type: 'text', text: { content } }]
      : []
  }
}

function titlePropertyValue(input) {
  const content = String(input ?? '').slice(0, 2000) || 'Untitled Canvas Item'
  return {
    title: [{ type: 'text', text: { content } }]
  }
}

function readPlainText(property) {
  if (!property) return ''
  const list = property.title || property.rich_text || []
  return list.map((entry) => entry.plain_text || '').join('')
}

function parseLinkHeader(headerValue) {
  if (!headerValue) return {}
  return headerValue.split(',').reduce((acc, part) => {
    const match = part.match(/<([^>]+)>;\s*rel="([^"]+)"/)
    if (match) {
      acc[match[2]] = match[1]
    }
    return acc
  }, {})
}

module.exports = {
  sleep,
  deepMerge,
  withRetry,
  mapWithConcurrency,
  runRateLimitedTasks,
  stableStringify,
  hashObject,
  formatDuration,
  nowIso,
  toBoolean,
  toNumber,
  extractNotionId,
  textPropertyValue,
  titlePropertyValue,
  readPlainText,
  parseLinkHeader
}
