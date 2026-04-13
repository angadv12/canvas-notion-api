const test = require('node:test')
const assert = require('node:assert/strict')
const { createSyncPlan, runSync } = require('../src/sync')
const { createStateFromPages, createTrackedItem, defaultState } = require('../src/state')

function createSyncConfig() {
  return {
    canvas: { courseScope: 'latest-term' },
    notion: { databaseId: 'db-1', parentPageId: '', databaseTitle: 'Canvas Assignments' },
    sync: {
      includeDiscussions: true,
      canvasConcurrency: 3,
      notionWriteConcurrency: 2,
      notionWriteDelayMs: 0
    }
  }
}

function createMemoryStateStore(state = defaultState()) {
  return {
    state,
    saveCalled: 0,
    trackPage(sourceKey, pageId, archived, item = {}) {
      this.state.items[sourceKey] = createTrackedItem({
        sourceKey,
        pageId,
        archived,
        courseId: item.courseId,
        sourceSignature: item.sourceSignature
      })
    },
    replacePages(databaseId, pages) {
      const nextState = createStateFromPages(databaseId, pages)
      this.state.version = nextState.version
      this.state.databaseId = nextState.databaseId
      this.state.items = nextState.items
    },
    save() {
      this.saveCalled += 1
    }
  }
}

function createCanvasItem(overrides = {}) {
  return {
    sourceKey: 'course-1:assignment:1',
    courseId: 'course-1',
    sourceSignature: 'sig-1',
    title: 'Homework 1',
    url: 'https://canvas/item/1',
    itemType: 'assignment',
    canvasId: '1',
    courseName: 'Algorithms',
    dueStart: null,
    dueEnd: null,
    canvasUpdatedAt: null,
    ...overrides
  }
}

function createCanvasProvider(items) {
  return {
    async getCourses() {
      return [{ id: 'course-1', name: 'Algorithms' }]
    },
    async getWorkItemsForCourses() {
      return items
    }
  }
}

test('createSyncPlan creates, updates, restores, and archives correctly from cached state', () => {
  const items = [
    {
      sourceKey: 'course-1:assignment:1',
      courseId: 'course-1',
      sourceSignature: 'new-signature'
    },
    {
      sourceKey: 'course-1:assignment:2',
      courseId: 'course-1',
      sourceSignature: 'restore-signature'
    },
    {
      sourceKey: 'course-2:discussion:7',
      courseId: 'course-2',
      sourceSignature: 'keep-signature'
    }
  ]

  const state = defaultState()
  state.items = {
    'course-1:assignment:1': createTrackedItem({
      sourceKey: 'course-1:assignment:1',
      pageId: 'page-update',
      courseId: 'course-1',
      sourceSignature: 'old-signature'
    }),
    'course-1:assignment:2': createTrackedItem({
      sourceKey: 'course-1:assignment:2',
      pageId: 'page-restore',
      archived: true,
      courseId: 'course-1',
      sourceSignature: 'old-restore-signature'
    }),
    'course-1:assignment:3': createTrackedItem({
      sourceKey: 'course-1:assignment:3',
      pageId: 'page-archive',
      courseId: 'course-1',
      sourceSignature: 'archive-me'
    }),
    'course-9:assignment:9': createTrackedItem({
      sourceKey: 'course-9:assignment:9',
      pageId: 'page-out-of-scope',
      courseId: 'course-9',
      sourceSignature: 'leave-alone'
    })
  }

  const plan = createSyncPlan({
    items,
    state,
    inScopeCourseIds: new Set(['course-1', 'course-2'])
  })

  assert.deepEqual(plan.creates, [
    {
      item: items[2]
    }
  ])
  assert.deepEqual(plan.updates, [
    {
      pageId: 'page-update',
      item: items[0]
    }
  ])
  assert.deepEqual(plan.restores, [
    {
      pageId: 'page-restore',
      item: items[1]
    }
  ])
  assert.deepEqual(plan.archives, [
    {
      pageId: 'page-archive',
      sourceKey: 'course-1:assignment:3',
      courseId: 'course-1',
      sourceSignature: 'archive-me'
    }
  ])
})

test('runSync is a no-op when cached signatures match and skips full Notion reads', async () => {
  const state = defaultState()
  state.databaseId = 'db-1'
  state.items = {
    'course-1:assignment:1': createTrackedItem({
      sourceKey: 'course-1:assignment:1',
      pageId: 'page-1',
      courseId: 'course-1',
      sourceSignature: 'same'
    })
  }

  const writes = []
  const notionProvider = {
    async ensureDatabase() {
      return 'db-1'
    },
    async listPages() {
      throw new Error('listPages should not be called on the cached fast path')
    },
    async createPage() {
      writes.push('create')
    },
    async updatePage() {
      writes.push('update')
    },
    async restorePage() {
      writes.push('restore')
    },
    async archivePage() {
      writes.push('archive')
    },
    isStaleStateError() {
      return false
    }
  }

  const stateStore = createMemoryStateStore(state)
  const result = await runSync({
    config: createSyncConfig(),
    canvasProvider: createCanvasProvider([createCanvasItem({ sourceSignature: 'same' })]),
    notionProvider,
    stateStore,
    logger: { log() {} },
    options: {}
  })

  assert.equal(result.creates, 0)
  assert.equal(result.updates, 0)
  assert.equal(result.archives, 0)
  assert.equal(result.reconciled, false)
  assert.equal(writes.length, 0)
  assert.equal(stateStore.saveCalled, 1)
})

test('runSync dry-run reconciles when state is missing but does not persist state', async () => {
  const stateStore = createMemoryStateStore(defaultState())
  let listPagesCalls = 0

  const result = await runSync({
    config: createSyncConfig(),
    canvasProvider: createCanvasProvider([createCanvasItem()]),
    notionProvider: {
      async ensureDatabase() {
        return 'db-1'
      },
      async listPages() {
        listPagesCalls += 1
        return []
      }
    },
    stateStore,
    logger: { log() {} },
    options: { dryRun: true }
  })

  assert.equal(result.dryRun, true)
  assert.equal(result.creates, 1)
  assert.equal(result.reconciled, true)
  assert.equal(listPagesCalls, 1)
  assert.equal(stateStore.saveCalled, 0)
})

test('runSync --reconcile rebuilds cached state from Notion pages', async () => {
  const state = defaultState()
  state.databaseId = 'db-1'
  state.items = {
    stale: createTrackedItem({
      sourceKey: 'stale',
      pageId: 'old-page',
      courseId: 'course-9',
      sourceSignature: 'stale'
    })
  }

  const stateStore = createMemoryStateStore(state)
  let listPagesCalls = 0

  const result = await runSync({
    config: createSyncConfig(),
    canvasProvider: createCanvasProvider([createCanvasItem({ sourceSignature: 'same' })]),
    notionProvider: {
      async ensureDatabase() {
        return 'db-1'
      },
      async listPages() {
        listPagesCalls += 1
        return [{
          pageId: 'page-1',
          sourceKey: 'course-1:assignment:1',
          courseId: 'course-1',
          sourceSignature: 'same',
          archived: false
        }]
      },
      async createPage() {
        throw new Error('no create expected')
      },
      async updatePage() {
        throw new Error('no update expected')
      },
      async restorePage() {
        throw new Error('no restore expected')
      },
      async archivePage() {
        throw new Error('no archive expected')
      },
      isStaleStateError() {
        return false
      }
    },
    stateStore,
    logger: { log() {} },
    options: { reconcile: true }
  })

  assert.equal(result.reconciled, true)
  assert.equal(result.updates, 0)
  assert.equal(listPagesCalls, 1)
  assert.equal(stateStore.state.items['course-1:assignment:1'].pageId, 'page-1')
  assert.equal(stateStore.state.items['course-1:assignment:1'].sourceSignature, 'same')
  assert.equal(stateStore.saveCalled, 1)
})

test('runSync retries once with reconcile when cached page ids are stale', async () => {
  const state = defaultState()
  state.databaseId = 'db-1'
  state.items = {
    'course-1:assignment:1': createTrackedItem({
      sourceKey: 'course-1:assignment:1',
      pageId: 'stale-page',
      courseId: 'course-1',
      sourceSignature: 'old-signature'
    })
  }

  const stateStore = createMemoryStateStore(state)
  let listPagesCalls = 0
  let updateCalls = 0

  const result = await runSync({
    config: createSyncConfig(),
    canvasProvider: createCanvasProvider([createCanvasItem({ sourceSignature: 'new-signature' })]),
    notionProvider: {
      async ensureDatabase() {
        return 'db-1'
      },
      async listPages() {
        listPagesCalls += 1
        return [{
          pageId: 'fresh-page',
          sourceKey: 'course-1:assignment:1',
          courseId: 'course-1',
          sourceSignature: 'old-signature',
          archived: false
        }]
      },
      async createPage() {
        throw new Error('no create expected')
      },
      async updatePage(pageId) {
        updateCalls += 1
        if (pageId === 'stale-page') {
          const error = new Error('page not found')
          error.code = 'object_not_found'
          throw error
        }
        return {
          pageId,
          sourceKey: 'course-1:assignment:1',
          courseId: 'course-1',
          sourceSignature: 'new-signature',
          archived: false
        }
      },
      async restorePage() {
        throw new Error('no restore expected')
      },
      async archivePage() {
        throw new Error('no archive expected')
      },
      isStaleStateError(error) {
        return error.code === 'object_not_found'
      }
    },
    stateStore,
    logger: { log() {} },
    options: {}
  })

  assert.equal(result.updates, 1)
  assert.equal(listPagesCalls, 1)
  assert.equal(updateCalls, 2)
  assert.equal(stateStore.state.items['course-1:assignment:1'].pageId, 'fresh-page')
  assert.equal(stateStore.state.items['course-1:assignment:1'].sourceSignature, 'new-signature')
})
