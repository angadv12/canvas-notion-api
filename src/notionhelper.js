require('dotenv').config()
const { Client } = require('@notionhq/client')
const notionClient = new Client({ auth: process.env.NOTION_API })
const { setEnvValue } = require('./util')

class NotionHelper {
  constructor() {
    this.page = process.env.NOTION_PAGE
    this.databases = {}
  }

  /**
   * Finds or creates a Notion database for a given course.
   * First checks env var, then searches child blocks, then creates.
   */
  async ensureDatabase(course) {
    const envKey = `NOTION_DB_${course.id}`
    if (this.databases[course.id]) return this.databases[course.id]

    // 1. Check environment for existing DB ID
    const existingEnv = process.env[envKey]
    if (existingEnv) {
      this.databases[course.id] = existingEnv
      return existingEnv
    }

    // 2. Search for a matching child database by title via metadata
    const sanitizedTitle = `${course.name.replace(/,/g, ' -')} Assignments`
    let cursor = undefined
    let foundDbId = null
    do {
      const resp = await notionClient.blocks.children.list({
        block_id: this.page,
        start_cursor: cursor
      })
      cursor = resp.has_more ? resp.next_cursor : undefined
      for (const block of resp.results) {
        if (block.type === 'child_database') {
          const dbId = block.id || block.child_database?.id
          try {
            const meta = await notionClient.databases.retrieve({ database_id: dbId })
            const titleText = meta.title.map(t => t.plain_text).join('')
            if (titleText === sanitizedTitle) {
              foundDbId = dbId
              break
            }
          } catch (e) {
            // ignore retrieval errors
          }
        }
      }
    } while (cursor && !foundDbId)

    if (foundDbId) {
      this.databases[course.id] = foundDbId
      setEnvValue(envKey, foundDbId)
      return foundDbId
    }

    // 3. Create a new database if none found
    const db = await notionClient.databases.create({
      parent: { type: 'page_id', page_id: this.page },
      title: [{ type: 'text', text: { content: sanitizedTitle } }],
      properties: {
        'Assignment Name': { type: 'title', title: {} },
        'Due Date': { type: 'date', date: {} },
        URL: { type: 'url', url: {} },
        Completion: { type: 'checkbox', checkbox: {} }
      }
    })

    this.databases[course.id] = db.id
    setEnvValue(envKey, db.id)
    return db.id
  }

  async getExistingURLs(dbId) {
    const urls = []
    let cursor
    do {
      const resp = await notionClient.databases.query({
        database_id: dbId,
        start_cursor: cursor
      })
      cursor = resp.has_more ? resp.next_cursor : null
      resp.results.forEach(page => {
        const url = page.properties.URL.url
        if (url) urls.push(url)
      })
    } while (cursor)
    return urls
  }

  /** Creates or updates a page based on URL uniqueness */
  async createOrUpdatePage(dbId, props) {
    if (props['Due Date'] && (!props['Due Date'].date || props['Due Date'].date.start === undefined)) {
      delete props['Due Date']
    }
    const existing = await this.getExistingURLs(dbId)
    if (existing.includes(props.URL.url)) {
      const resp = await notionClient.databases.query({
        database_id: dbId,
        filter: { property: 'URL', url: { equals: props.URL.url } }
      })
      const pageId = resp.results[0].id
      await notionClient.pages.update({ page_id: pageId, properties: props })
    } else {
      await notionClient.pages.create({
        parent: { type: 'database_id', database_id: dbId },
        properties: props
      })
    }
  }
}

module.exports = { NotionHelper }