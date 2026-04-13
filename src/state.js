const { STATE_VERSION } = require('./constants')
const { nowIso } = require('./utils')
const { getPaths } = require('./paths')
const { readJson, writeJson } = require('./config')

function defaultState() {
  return {
    version: STATE_VERSION,
    databaseId: '',
    items: {},
    lastSyncedAt: ''
  }
}

function deriveCourseIdFromSourceKey(sourceKey) {
  if (!sourceKey) return ''
  const [courseId] = String(sourceKey).split(':')
  return courseId || ''
}

function createTrackedItem({ sourceKey, pageId, archived = false, courseId = '', sourceSignature = '' }) {
  return {
    pageId: String(pageId || ''),
    archived: Boolean(archived),
    courseId: String(courseId || deriveCourseIdFromSourceKey(sourceKey)),
    sourceSignature: String(sourceSignature || '')
  }
}

function createStateFromPages(databaseId, pages = []) {
  const state = defaultState()
  state.databaseId = String(databaseId || '')

  for (const page of pages) {
    if (!page?.sourceKey || !page.pageId) continue
    state.items[page.sourceKey] = createTrackedItem({
      sourceKey: page.sourceKey,
      pageId: page.pageId,
      archived: page.archived,
      courseId: page.courseId,
      sourceSignature: page.sourceSignature
    })
  }

  return state
}

function normalizeState(input) {
  if (!input || typeof input !== 'object') {
    return defaultState()
  }

  const state = defaultState()
  state.databaseId = String(input.databaseId || '')
  state.lastSyncedAt = String(input.lastSyncedAt || input.updatedAt || '')

  for (const [sourceKey, tracked] of Object.entries(input.items || {})) {
    const normalized = createTrackedItem({
      sourceKey,
      pageId: tracked?.pageId,
      archived: tracked?.archived,
      courseId: tracked?.courseId,
      sourceSignature: tracked?.sourceSignature
    })

    if (normalized.pageId) {
      state.items[sourceKey] = normalized
    }
  }

  return state
}

function loadState({ cwd, scope }) {
  const paths = getPaths(cwd)
  return normalizeState(readJson(paths[scope].state))
}

function saveState({ cwd, scope, state }) {
  const paths = getPaths(cwd)
  const normalized = normalizeState(state)
  writeJson(paths[scope].state, {
    version: STATE_VERSION,
    databaseId: normalized.databaseId,
    items: normalized.items,
    lastSyncedAt: normalized.lastSyncedAt || nowIso(),
    updatedAt: nowIso()
  })
  return paths[scope].state
}

module.exports = {
  defaultState,
  deriveCourseIdFromSourceKey,
  createTrackedItem,
  createStateFromPages,
  normalizeState,
  loadState,
  saveState
}
