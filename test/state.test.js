const test = require('node:test')
const assert = require('node:assert/strict')
const { normalizeState } = require('../src/state')

test('normalizeState migrates legacy v1 state entries to the cache-aware v2 shape', () => {
  const state = normalizeState({
    version: 1,
    databaseId: 'db-1',
    updatedAt: '2026-04-13T12:00:00.000Z',
    items: {
      'course-1:assignment:1': {
        pageId: 'page-1',
        archived: true
      }
    }
  })

  assert.equal(state.version, 2)
  assert.equal(state.databaseId, 'db-1')
  assert.equal(state.lastSyncedAt, '2026-04-13T12:00:00.000Z')
  assert.deepEqual(state.items['course-1:assignment:1'], {
    pageId: 'page-1',
    archived: true,
    courseId: 'course-1',
    sourceSignature: ''
  })
})
