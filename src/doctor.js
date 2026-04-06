const { CanvasProvider } = require('./canvas')
const { NotionProvider } = require('./notion')

async function runDoctor({ config, logger = console }) {
  if (!config.canvas.baseUrl) throw new Error('Canvas base URL is not configured.')
  if (!config.canvas.token) throw new Error('Canvas token is not configured.')
  if (!config.notion.token) throw new Error('Notion token is not configured.')
  if (!config.notion.databaseId && !config.notion.parentPageId) {
    throw new Error('Notion database or parent page is not configured.')
  }

  const canvas = new CanvasProvider(config)
  const notion = new NotionProvider(config)

  await canvas.verifyAccess()
  logger.log('Canvas access: ok')

  await notion.verifyAccess()
  logger.log('Notion access: ok')

  const databaseId = await notion.ensureDatabase({
    databaseId: config.notion.databaseId,
    parentPageId: config.notion.parentPageId,
    title: config.notion.databaseTitle
  })
  logger.log(`Notion database: ok (${databaseId})`)
}

module.exports = { runDoctor }
