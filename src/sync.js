const { formatDuration, nowIso, runRateLimitedTasks } = require('./utils')

function createSyncPlan({ items, existingPages, state, inScopeCourseIds }) {
  const creates = []
  const updates = []
  const restores = []
  const archives = []

  const itemMap = new Map(items.map((item) => [item.sourceKey, item]))
  const pageMap = new Map(existingPages.filter((page) => page.sourceKey).map((page) => [page.sourceKey, page]))
  const stateItems = state.items || {}

  for (const item of items) {
    const existingPage = pageMap.get(item.sourceKey)
    if (existingPage) {
      if (existingPage.sourceSignature !== item.sourceSignature) {
        updates.push({ pageId: existingPage.pageId, item })
      }
      continue
    }

    const tracked = stateItems[item.sourceKey]
    if (tracked?.pageId && tracked.archived) {
      restores.push({ pageId: tracked.pageId, item })
      continue
    }

    creates.push({ item })
  }

  for (const page of existingPages) {
    if (!page.sourceKey || !page.courseId) continue
    if (!inScopeCourseIds.has(page.courseId)) continue
    if (!itemMap.has(page.sourceKey)) {
      archives.push({ pageId: page.pageId, sourceKey: page.sourceKey })
    }
  }

  return { creates, updates, restores, archives }
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

  const existingReadStart = Date.now()
  const existingPages = await notionProvider.listPages(databaseId)
  timings.notionReadMs = Date.now() - existingReadStart

  const diffStart = Date.now()
  const inScopeCourseIds = new Set(courses.map((course) => course.id))
  const plan = createSyncPlan({
    items,
    existingPages,
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
    databaseId
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
  const writeOptions = {
    concurrency: config.sync.notionWriteConcurrency,
    minIntervalMs: config.sync.notionWriteDelayMs
  }
  await runRateLimitedTasks(plan.creates, writeOptions, async (entry) => {
    const page = await notionProvider.createPage(databaseId, entry.item)
    stateStore.trackPage(entry.item.sourceKey, page.pageId, false)
  })
  await runRateLimitedTasks(plan.updates, writeOptions, async (entry) => {
    const page = await notionProvider.updatePage(entry.pageId, entry.item)
    stateStore.trackPage(entry.item.sourceKey, page.pageId, false)
  })
  await runRateLimitedTasks(plan.restores, writeOptions, async (entry) => {
    const page = await notionProvider.restorePage(entry.pageId, entry.item)
    stateStore.trackPage(entry.item.sourceKey, page.pageId, false)
  })
  await runRateLimitedTasks(plan.archives, writeOptions, async (entry) => {
    await notionProvider.archivePage(entry.pageId)
    stateStore.trackPage(entry.sourceKey, entry.pageId, true)
  })
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
  runSync
}
