const test = require('node:test')
const assert = require('node:assert/strict')
const { createSyncPlan, runSync } = require('../src/sync')
const { defaultState } = require('../src/state')

test('createSyncPlan creates, updates, restores, and archives correctly', () => {
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

  const existingPages = [
    {
      pageId: 'page-update',
      sourceKey: 'course-1:assignment:1',
      courseId: 'course-1',
      sourceSignature: 'old-signature'
    },
    {
      pageId: 'page-archive',
      sourceKey: 'course-1:assignment:3',
      courseId: 'course-1',
      sourceSignature: 'archive-me'
    },
    {
      pageId: 'page-out-of-scope',
      sourceKey: 'course-9:assignment:9',
      courseId: 'course-9',
      sourceSignature: 'leave-alone'
    }
  ]

  const state = {
    version: 1,
    items: {
      'course-1:assignment:2': {
        pageId: 'page-restore',
        archived: true
      }
    }
  }

  const plan = createSyncPlan({
    items,
    existingPages,
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
      sourceKey: 'course-1:assignment:3'
    }
  ])
})

test('runSync is a no-op when signatures match', async () => {
  const state = defaultState()
  const writes = []

  const canvasProvider = {
    async getCourses() {
      return [{ id: 'course-1', name: 'Algorithms' }]
    },
    async getWorkItemsForCourses() {
      return [{
        sourceKey: 'course-1:assignment:1',
        courseId: 'course-1',
        sourceSignature: 'same',
        title: 'Homework 1',
        url: 'https://canvas/item/1',
        itemType: 'assignment',
        canvasId: '1',
        courseName: 'Algorithms',
        dueStart: null,
        dueEnd: null,
        canvasUpdatedAt: null
      }]
    }
  }

  const notionProvider = {
    async ensureDatabase() {
      return 'db-1'
    },
    async listPages() {
      return [{
        pageId: 'page-1',
        sourceKey: 'course-1:assignment:1',
        courseId: 'course-1',
        sourceSignature: 'same'
      }]
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
    }
  }

  const stateStore = {
    state,
    trackPage() {},
    saveCalled: 0,
    save() {
      this.saveCalled += 1
    }
  }

  const result = await runSync({
    config: {
      canvas: { courseScope: 'latest-term' },
      notion: { databaseId: 'db-1', parentPageId: '', databaseTitle: 'Canvas Assignments' },
      sync: { includeDiscussions: true, canvasConcurrency: 3 }
    },
    canvasProvider,
    notionProvider,
    stateStore,
    logger: { log() {} },
    options: {}
  })

  assert.equal(result.creates, 0)
  assert.equal(result.updates, 0)
  assert.equal(result.archives, 0)
  assert.equal(writes.length, 0)
  assert.equal(stateStore.saveCalled, 1)
})

test('runSync dry-run does not mutate notion or state', async () => {
  const state = defaultState()

  const stateStore = {
    state,
    trackPage() {
      throw new Error('trackPage should not be called during dry-run')
    },
    saveCalled: 0,
    save() {
      this.saveCalled += 1
    }
  }

  const result = await runSync({
    config: {
      canvas: { courseScope: 'latest-term' },
      notion: { databaseId: 'db-1', parentPageId: '', databaseTitle: 'Canvas Assignments' },
      sync: { includeDiscussions: true, canvasConcurrency: 2 }
    },
    canvasProvider: {
      async getCourses() {
        return [{ id: 'course-1', name: 'Databases' }]
      },
      async getWorkItemsForCourses() {
        return [{
          sourceKey: 'course-1:assignment:1',
          courseId: 'course-1',
          sourceSignature: 'abc'
        }]
      }
    },
    notionProvider: {
      async ensureDatabase() {
        return 'db-1'
      },
      async listPages() {
        return []
      }
    },
    stateStore,
    logger: { log() {} },
    options: { dryRun: true }
  })

  assert.equal(result.dryRun, true)
  assert.equal(result.creates, 1)
  assert.equal(stateStore.saveCalled, 0)
})
