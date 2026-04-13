const { formatDuration, nowIso, runRateLimitedTasks } = require('./utils')

function createSyncPlan({ items, state, inScopeCourseIds }) {
  const creates = []
  const updates = []
  const restores = []
  const archives = []

  const itemMap = new Map(items.map((item) => [item.sourceKey, item]))
  const trackedItems = state.items || {}

  for (const item of items) {
    const tracked = trackedItems[item.sourceKey]
    if (tracked?.pageId && !tracked.archived) {
      if (tracked.sourceSignature !== item.sourceSignature) {
        updates.push({ pageId: tracked.pageId, item })
      }
      continue
    }

    if (tracked?.pageId && tracked.archived) {
      restores.push({ pageId: tracked.pageId, item })
      continue
    }

    creates.push({ item })
  }

  for (const [sourceKey, tracked] of Object.entries(trackedItems)) {
    if (!tracked?.pageId || tracked.archived || !tracked.courseId) continue
    if (!inScopeCourseIds.has(tracked.courseId)) continue
    if (!itemMap.has(sourceKey)) {
      archives.push({
        pageId: tracked.pageId,
        sourceKey,
        courseId: tracked.courseId,
        sourceSignature: tracked.sourceSignature || ''
      })
    }
  }

  return { creates, updates, restores, archives }
}

function shouldReconcileState({ state, databaseId, forceReconcile = false }) {
  if (forceReconcile) return true
  if (!state?.databaseId || state.databaseId !== databaseId) return true

  const trackedItems = Object.values(state.items || {})
  if (!trackedItems.length) return true

  return trackedItems.some((tracked) => !tracked.pageId || !tracked.courseId)
}

async function runSync({
  config,
  canvasProvider,
  notionProvider,
  stateStore,
  logger = console,
  options = {}
}) {
  const timings = {}
  const startedAt = Date.now()

  const courseScope = options.scope || config.canvas.courseScope
  const courseFilter = options.courseFilter || []
  const includeDiscussions = options.includeDiscussions ?? config.sync.includeDiscussions

  const courseStart = Date.now()
  const courses = await canvasProvider.getCourses({ scope: courseScope, courseFilter })
  timings.courseFetchMs = Date.now() - courseStart

  const canvasFetchStart = Date.now()
  const items = await canvasProvider.getWorkItemsForCourses(courses, {
    includeDiscussions,
    concurrency: config.sync.canvasConcurrency
  })
  timings.canvasFetchMs = Date.now() - canvasFetchStart

  if (options.dryRun && !config.notion.databaseId) {
    throw new Error('Dry-run requires an existing Notion database. Run `canvas-notion setup` first.')
  }

  const databaseId = await notionProvider.ensureDatabase({
    databaseId: config.notion.databaseId,
    parentPageId: config.notion.parentPageId,
    title: config.notion.databaseTitle
  })

  const reconciled = shouldReconcileState({
    state: stateStore.state,
    databaseId,
    forceReconcile: Boolean(options.reconcile)
  })

  if (reconciled) {
    const existingReadStart = Date.now()
    const existingPages = await notionProvider.listPages(databaseId)
    stateStore.replacePages(databaseId, existingPages)
    timings.notionReadMs = Date.now() - existingReadStart
  } else {
    timings.notionReadMs = 0
  }

  const diffStart = Date.now()
  const inScopeCourseIds = new Set(courses.map((course) => course.id))
  const plan = createSyncPlan({
    items,
    state: stateStore.state,
    inScopeCourseIds
  })
  timings.diffMs = Date.now() - diffStart

  const summary = {
    courses: courses.length,
    items: items.length,
    creates: plan.creates.length,
    updates: plan.updates.length,
    restores: plan.restores.length,
    archives: plan.archives.length,
    dryRun: Boolean(options.dryRun),
    databaseId,
    reconciled
  }

  if (options.dryRun) {
    return finishSync({
      logger,
      stateStore,
      summary,
      timings,
      startedAt,
      databaseId,
      persistState: false
    })
  }

  const writeStart = Date.now()
  try {
    await applySyncPlan({
      plan,
      config,
      databaseId,
      notionProvider,
      stateStore
    })
  } catch (error) {
    if (
      !reconciled &&
      !options.retryAfterStaleState &&
      typeof notionProvider.isStaleStateError === 'function' &&
      notionProvider.isStaleStateError(error)
    ) {
      logger.log('Cached Notion state is stale. Rebuilding from Notion and retrying once.')
      return runSync({
        config,
        canvasProvider,
        notionProvider,
        stateStore,
        logger,
        options: {
          ...options,
          reconcile: true,
          retryAfterStaleState: true
        }
      })
    }
    throw error
  }
  timings.notionWriteMs = Date.now() - writeStart

  return finishSync({
    logger,
    stateStore,
    summary,
    timings,
    startedAt,
    databaseId,
    persistState: true
  })
}

async function applySyncPlan({ plan, config, databaseId, notionProvider, stateStore }) {
  const writeOptions = {
    concurrency: config.sync.notionWriteConcurrency,
    minIntervalMs: config.sync.notionWriteDelayMs
  }

  await runRateLimitedTasks(plan.creates, writeOptions, async (entry) => {
    const page = await notionProvider.createPage(databaseId, entry.item)
    stateStore.trackPage(entry.item.sourceKey, page.pageId, false, entry.item)
  })
  await runRateLimitedTasks(plan.updates, writeOptions, async (entry) => {
    const page = await notionProvider.updatePage(entry.pageId, entry.item)
    stateStore.trackPage(entry.item.sourceKey, page.pageId, false, entry.item)
  })
  await runRateLimitedTasks(plan.restores, writeOptions, async (entry) => {
    const page = await notionProvider.restorePage(entry.pageId, entry.item)
    stateStore.trackPage(entry.item.sourceKey, page.pageId, false, entry.item)
  })
  await runRateLimitedTasks(plan.archives, writeOptions, async (entry) => {
    await notionProvider.archivePage(entry.pageId)
    stateStore.trackPage(entry.sourceKey, entry.pageId, true, entry)
  })
}

function finishSync({ logger, stateStore, summary, timings, startedAt, databaseId, persistState }) {
  if (persistState) {
    stateStore.state.databaseId = databaseId
    stateStore.state.lastSyncedAt = nowIso()
    stateStore.save()
  }

  const totalMs = Date.now() - startedAt
  timings.totalMs = totalMs

  logger.log(
    `Sync summary: ${summary.creates} create, ${summary.updates} update, ${summary.restores} restore, ${summary.archives} archive across ${summary.courses} course(s).`
  )
  logger.log(
    `Timing: courses ${formatDuration(timings.courseFetchMs)}, canvas ${formatDuration(timings.canvasFetchMs)}, notion-read ${formatDuration(timings.notionReadMs)}, diff ${formatDuration(timings.diffMs)}, notion-write ${formatDuration(timings.notionWriteMs || 0)}, total ${formatDuration(totalMs)}`
  )

  return {
    ...summary,
    timings
  }
}

module.exports = {
  createSyncPlan,
  shouldReconcileState,
  runSync
}
