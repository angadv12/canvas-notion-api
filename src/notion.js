const { Client, isNotionClientError, APIErrorCode } = require('@notionhq/client')
const {
  DEFAULT_DATABASE_TITLE,
  REQUIRED_DATABASE_PROPERTIES
} = require('./constants')
const {
  readPlainText,
  textPropertyValue,
  titlePropertyValue,
  withRetry
} = require('./utils')

class NotionProvider {
  constructor(config, options = {}) {
    this.client = options.client || new Client({
      auth: config.notion.token,
      timeoutMs: config.sync.requestTimeoutMs,
      notionVersion: '2026-03-11',
      maxRetries: 0
    })
    this.maxRetries = config.sync.maxRetries
    this.dataSourceIds = new Map()
  }

  async verifyAccess() {
    await this.client.users.me()
  }

  async ensureDatabase({ databaseId, parentPageId, title = DEFAULT_DATABASE_TITLE }) {
    if (databaseId) {
      await this.validateDatabaseSchema(databaseId)
      return databaseId
    }

    if (!parentPageId) {
      throw new Error('No Notion database is configured. Run `canvas-notion setup` first.')
    }

    const database = await this.withRetry(() => this.client.databases.create({
      parent: { type: 'page_id', page_id: parentPageId },
      title: [{ type: 'text', text: { content: title } }],
      initial_data_source: {
        properties: buildDatabaseProperties()
      }
    }), 'create Notion database')

    const primaryDataSourceId = database.data_sources?.[0]?.id
    if (!primaryDataSourceId) {
      throw new Error('Created Notion database has no primary data source.')
    }
    this.dataSourceIds.set(database.id, primaryDataSourceId)
    return database.id
  }

  async validateDatabaseSchema(databaseId) {
    const dataSourceId = await this.resolveDataSourceId(databaseId)
    const dataSource = await this.withRetry(
      () => this.client.dataSources.retrieve({ data_source_id: dataSourceId }),
      'retrieve Notion data source'
    )

    for (const [propertyName, propertyType] of Object.entries(REQUIRED_DATABASE_PROPERTIES)) {
      const property = dataSource.properties[propertyName]
      if (!property) {
        throw new Error(`Notion database is missing property "${propertyName}".`)
      }
      if (property.type !== propertyType) {
        throw new Error(
          `Notion property "${propertyName}" must be type "${propertyType}", found "${property.type}".`
        )
      }
    }
  }

  async listPages(databaseId) {
    const dataSourceId = await this.resolveDataSourceId(databaseId)
    const pages = []
    let cursor

    do {
      const response = await this.withRetry(
        () => this.client.dataSources.query({
          data_source_id: dataSourceId,
          start_cursor: cursor,
          result_type: 'page'
        }),
        'query Notion data source'
      )
      cursor = response.has_more ? response.next_cursor : null
      pages.push(...response.results.map(parseNotionPage))
    } while (cursor)

    return pages
  }

  async getPage(pageId) {
    const page = await this.withRetry(() => this.client.pages.retrieve({ page_id: pageId }), 'retrieve Notion page')
    return parseNotionPage(page)
  }

  async createPage(databaseId, item) {
    const dataSourceId = await this.resolveDataSourceId(databaseId)
    const page = await this.withRetry(() => this.client.pages.create({
      parent: { data_source_id: dataSourceId },
      properties: toNotionProperties(item)
    }), 'create Notion page')
    return parseNotionPage(page)
  }

  async updatePage(pageId, item) {
    const page = await this.withRetry(() => this.client.pages.update({
      page_id: pageId,
      properties: toNotionProperties(item)
    }), 'update Notion page')
    return parseNotionPage(page)
  }

  async archivePage(pageId) {
    await this.withRetry(() => this.client.pages.update({
      page_id: pageId,
      in_trash: true
    }), 'archive Notion page')
  }

  async restorePage(pageId, item) {
    const page = await this.withRetry(() => this.client.pages.update({
      page_id: pageId,
      in_trash: false,
      properties: toNotionProperties(item)
    }), 'restore Notion page')
    return parseNotionPage(page)
  }

  async withRetry(task, label) {
    return withRetry(task, {
      retries: this.maxRetries,
      label,
      shouldRetry: (error) => isRetriableNotionError(error)
    })
  }

  async resolveDataSourceId(databaseId) {
    if (this.dataSourceIds.has(databaseId)) {
      return this.dataSourceIds.get(databaseId)
    }

    const database = await this.withRetry(
      () => this.client.databases.retrieve({ database_id: databaseId }),
      'retrieve Notion database'
    )
    const primaryDataSourceId = database.data_sources?.[0]?.id
    if (!primaryDataSourceId) {
      throw new Error('Notion database has no primary data source.')
    }
    this.dataSourceIds.set(databaseId, primaryDataSourceId)
    return primaryDataSourceId
  }
}

function buildDatabaseProperties() {
  return {
    'Assignment Name': { title: {} },
    Course: { rich_text: {} },
    'Course ID': { rich_text: {} },
    'Canvas ID': { rich_text: {} },
    'Item Type': {
      select: {
        options: [{ name: 'assignment' }, { name: 'discussion' }]
      }
    },
    URL: { url: {} },
    'Due Date': { date: {} },
    'Canvas Updated At': { date: {} },
    'Source Key': { rich_text: {} },
    'Source Signature': { rich_text: {} },
    Completion: { checkbox: {} }
  }
}

function toNotionProperties(item) {
  return {
    'Assignment Name': titlePropertyValue(item.title),
    Course: textPropertyValue(item.courseName),
    'Course ID': textPropertyValue(item.courseId),
    'Canvas ID': textPropertyValue(item.canvasId),
    'Item Type': {
      select: {
        name: item.itemType
      }
    },
    URL: { url: item.url || null },
    'Due Date': {
      date: item.dueStart
        ? { start: item.dueStart, end: item.dueEnd || null }
        : null
    },
    'Canvas Updated At': {
      date: item.canvasUpdatedAt
        ? { start: item.canvasUpdatedAt }
        : null
    },
    'Source Key': textPropertyValue(item.sourceKey),
    'Source Signature': textPropertyValue(item.sourceSignature)
  }
}

function parseNotionPage(page) {
  const properties = page.properties || {}
  return {
    pageId: page.id,
    archived: Boolean(page.in_trash || page.archived),
    title: readPlainText(properties['Assignment Name']),
    courseName: readPlainText(properties.Course),
    courseId: readPlainText(properties['Course ID']),
    canvasId: readPlainText(properties['Canvas ID']),
    itemType: properties['Item Type']?.select?.name || '',
    url: properties.URL?.url || '',
    dueStart: properties['Due Date']?.date?.start || null,
    dueEnd: properties['Due Date']?.date?.end || null,
    canvasUpdatedAt: properties['Canvas Updated At']?.date?.start || null,
    sourceKey: readPlainText(properties['Source Key']),
    sourceSignature: readPlainText(properties['Source Signature']),
    completion: Boolean(properties.Completion?.checkbox)
  }
}

function isRetriableNotionError(error) {
  if (!error) return false
  if (error.code === 'notionhq_client_request_timeout') return true
  if (isNotionClientError(error)) {
    return [
      APIErrorCode.RateLimited,
      APIErrorCode.InternalServerError,
      APIErrorCode.ServiceUnavailable,
      APIErrorCode.GatewayTimeout,
      APIErrorCode.ConflictError
    ].includes(error.code)
  }
  return Boolean(error.status && error.status >= 500)
}

module.exports = { NotionProvider, buildDatabaseProperties, toNotionProperties, parseNotionPage }
