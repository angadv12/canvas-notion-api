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

function completePropertySchema() {
  const properties = Object.fromEntries(
    Object.entries(REQUIRED_DATABASE_PROPERTIES).map(([name, type]) => [name, { type }])
  )
  properties['Item Type'] = {
    type: 'select',
    select: {
      options: [{ name: 'assignment' }, { name: 'discussion' }]
    }
  }
  return properties
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
          properties: completePropertySchema()
        }
      },
      async query(args) {
        calls.dataSourceQuery.push(args)
        return {
          has_more: false,
          next_cursor: null,
          results: []
        }
      },
      async update() {
        throw new Error('schema update should not be needed for complete schemas')
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

test('NotionProvider enriches an existing schema with missing sync metadata properties', async () => {
  const calls = {
    dataSourceUpdate: []
  }

  const partialProperties = completePropertySchema()
  delete partialProperties['Course ID']
  delete partialProperties['Canvas ID']
  delete partialProperties['Item Type']
  delete partialProperties['Source Key']
  delete partialProperties['Source Signature']

  const fakeClient = {
    users: {
      async me() {
        return { object: 'user' }
      }
    },
    databases: {
      async retrieve() {
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
          properties: partialProperties
        }
      },
      async update(args) {
        calls.dataSourceUpdate.push(args)
        return {
          id: 'ds-1',
          properties: {
            ...partialProperties,
            ...args.properties
          }
        }
      }
    },
    pages: {
      async create() {
        throw new Error('not needed')
      },
      async update() {
        throw new Error('not needed')
      }
    }
  }

  const provider = new NotionProvider(createTestConfig(), { client: fakeClient })
  await provider.ensureDatabase({ databaseId: 'db-1' })

  assert.equal(calls.dataSourceUpdate.length, 1)
  assert.deepEqual(Object.keys(calls.dataSourceUpdate[0].properties).sort(), [
    'Canvas ID',
    'Course ID',
    'Item Type',
    'Source Key',
    'Source Signature'
  ])
})

test('NotionProvider update payload refreshes Canvas fields without touching Completion', async () => {
  const calls = {
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
          properties: completePropertySchema()
        }
      }
    },
    pages: {
      async create() {
        throw new Error('not needed')
      },
      async update(args) {
        calls.pageUpdate.push(args)
        return {
          id: args.page_id,
          in_trash: false,
          properties: args.properties || {}
        }
      }
    }
  }

  const provider = new NotionProvider(createTestConfig(), { client: fakeClient })
  await provider.updatePage('page-1', {
    title: 'Homework 2',
    courseName: 'Databases',
    courseId: 'course-1',
    canvasId: 'item-1',
    itemType: 'assignment',
    url: 'https://canvas/item-1',
    dueStart: '2026-04-20T23:59:00.000Z',
    dueEnd: null,
    canvasUpdatedAt: '2026-04-13T12:00:00.000Z',
    sourceKey: 'course-1:assignment:item-1',
    sourceSignature: 'sig-2'
  })

  const properties = calls.pageUpdate[0].properties
  assert.equal(properties['Assignment Name'].title[0].text.content, 'Homework 2')
  assert.equal(properties['Due Date'].date.start, '2026-04-20T23:59:00.000Z')
  assert.equal('Completion' in properties, false)
})
