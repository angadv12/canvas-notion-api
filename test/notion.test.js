const test = require('node:test')
const assert = require('node:assert/strict')
const { NotionProvider } = require('../src/notion')
const { REQUIRED_DATABASE_PROPERTIES } = require('../src/constants')

function createTestConfig() {
  return {
    notion: {
      token: 'secret',
      databaseId: 'db-1',
      parentPageId: '',
      databaseTitle: 'Canvas Assignments'
    },
    sync: {
      requestTimeoutMs: 60000,
      maxRetries: 1
    }
  }
}

test('NotionProvider uses data sources for reads and data_source_id for page creation', async () => {
  const calls = {
    databaseRetrieve: 0,
    dataSourceQuery: [],
    pageCreate: [],
    pageUpdate: []
  }

  const fakeClient = {
    users: {
      async me() {
        return { object: 'user' }
      }
    },
    databases: {
      async retrieve() {
        calls.databaseRetrieve += 1
        return {
          id: 'db-1',
          data_sources: [{ id: 'ds-1', name: 'Primary' }]
        }
      }
    },
    dataSources: {
      async retrieve() {
        return {
          id: 'ds-1',
          properties: Object.fromEntries(
            Object.entries(REQUIRED_DATABASE_PROPERTIES).map(([name, type]) => [name, { type }])
          )
        }
      },
      async query(args) {
        calls.dataSourceQuery.push(args)
        return {
          has_more: false,
          next_cursor: null,
          results: []
        }
      }
    },
    pages: {
      async create(args) {
        calls.pageCreate.push(args)
        return {
          id: 'page-1',
          in_trash: false,
          properties: args.properties
        }
      },
      async update(args) {
        calls.pageUpdate.push(args)
        return {
          id: args.page_id,
          in_trash: Boolean(args.in_trash),
          properties: args.properties || {}
        }
      }
    }
  }

  const provider = new NotionProvider(createTestConfig(), { client: fakeClient })
  await provider.validateDatabaseSchema('db-1')
  await provider.listPages('db-1')
  await provider.createPage('db-1', {
    title: 'Homework 1',
    courseName: 'Databases',
    courseId: 'course-1',
    canvasId: 'item-1',
    itemType: 'assignment',
    url: 'https://canvas/item-1',
    dueStart: null,
    dueEnd: null,
    canvasUpdatedAt: null,
    sourceKey: 'course-1:assignment:item-1',
    sourceSignature: 'sig-1'
  })
  await provider.archivePage('page-1')
  await provider.restorePage('page-1', {
    title: 'Homework 1',
    courseName: 'Databases',
    courseId: 'course-1',
    canvasId: 'item-1',
    itemType: 'assignment',
    url: 'https://canvas/item-1',
    dueStart: null,
    dueEnd: null,
    canvasUpdatedAt: null,
    sourceKey: 'course-1:assignment:item-1',
    sourceSignature: 'sig-1'
  })

  assert.equal(calls.databaseRetrieve, 1)
  assert.deepEqual(calls.dataSourceQuery[0], {
    data_source_id: 'ds-1',
    start_cursor: undefined,
    result_type: 'page'
  })
  assert.equal(calls.pageCreate[0].parent.data_source_id, 'ds-1')
  assert.equal(calls.pageUpdate[0].in_trash, true)
  assert.equal(calls.pageUpdate[1].in_trash, false)
})
