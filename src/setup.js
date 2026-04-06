const readline = require('readline/promises')
const { stdin, stdout } = require('process')
const { DEFAULT_CONFIG, LINKS } = require('./constants')
const { saveConfig } = require('./config')
const { NotionProvider } = require('./notion')
const { CanvasProvider } = require('./canvas')
const { extractNotionId, toBoolean } = require('./utils')

async function runSetup({ cwd, config, scope, flags = {}, logger = console }) {
  const interactive = stdin.isTTY && stdout.isTTY && !flags.nonInteractive
  const rl = interactive ? readline.createInterface({ input: stdin, output: stdout }) : null

  try {
    logger.log('Canvas token docs:')
    logger.log(`  ${LINKS.canvasToken}`)
    logger.log('Notion integration docs:')
    logger.log(`  ${LINKS.notionIntegrations}`)
    logger.log(`  ${LINKS.notionConnections}`)

    const nextConfig = JSON.parse(JSON.stringify(config || DEFAULT_CONFIG))

    nextConfig.canvas.baseUrl = await resolveValue({
      interactive,
      rl,
      current: nextConfig.canvas.baseUrl,
      flagValue: flags.canvasUrl,
      prompt: 'Canvas base URL'
    })
    nextConfig.canvas.token = await resolveValue({
      interactive,
      rl,
      current: nextConfig.canvas.token,
      flagValue: flags.canvasToken,
      prompt: 'Canvas API token'
    })
    nextConfig.notion.token = await resolveValue({
      interactive,
      rl,
      current: nextConfig.notion.token,
      flagValue: flags.notionToken,
      prompt: 'Notion integration token'
    })
    nextConfig.canvas.courseScope = await resolveValue({
      interactive,
      rl,
      current: nextConfig.canvas.courseScope,
      flagValue: flags.scope,
      prompt: 'Course scope (`latest-term` or `all-active`)',
      fallback: 'latest-term'
    })
    nextConfig.sync.includeDiscussions = toBoolean(await resolveValue({
      interactive,
      rl,
      current: String(nextConfig.sync.includeDiscussions),
      flagValue: flags.includeDiscussions,
      prompt: 'Include Canvas discussions? (`true` or `false`)',
      fallback: 'true'
    }), true)

    const attachExisting = toBoolean(await resolveValue({
      interactive,
      rl,
      current: flags.databaseUrl || nextConfig.notion.databaseId ? 'true' : '',
      flagValue: flags.attachExisting,
      prompt: 'Attach to an existing Notion database? (`true` or `false`)',
      fallback: flags.databaseUrl ? 'true' : 'false'
    }), false)

    if (attachExisting) {
      const databaseValue = await resolveValue({
        interactive,
        rl,
        current: nextConfig.notion.databaseId,
        flagValue: flags.databaseUrl || flags.databaseId,
        prompt: 'Existing Notion database URL or ID'
      })
      nextConfig.notion.databaseId = extractNotionId(databaseValue)
      nextConfig.notion.parentPageId = ''
    } else {
      const pageValue = await resolveValue({
        interactive,
        rl,
        current: nextConfig.notion.parentPageId,
        flagValue: flags.parentUrl || flags.parentPageId,
        prompt: 'Parent Notion page URL or ID for the new database'
      })
      nextConfig.notion.parentPageId = extractNotionId(pageValue)
      nextConfig.notion.databaseId = ''
      nextConfig.notion.databaseTitle = await resolveValue({
        interactive,
        rl,
        current: nextConfig.notion.databaseTitle,
        flagValue: flags.databaseTitle,
        prompt: 'Database title',
        fallback: DEFAULT_CONFIG.notion.databaseTitle
      })
    }

    assertRequiredSetupValues(nextConfig)

    const canvasProvider = new CanvasProvider(nextConfig)
    const notionProvider = new NotionProvider(nextConfig)
    await canvasProvider.verifyAccess()
    await notionProvider.verifyAccess()
    nextConfig.notion.databaseId = await notionProvider.ensureDatabase({
      databaseId: nextConfig.notion.databaseId,
      parentPageId: nextConfig.notion.parentPageId,
      title: nextConfig.notion.databaseTitle
    })

    const configPath = saveConfig({ cwd, scope, config: nextConfig })
    logger.log(`Configuration written to ${configPath}`)
    logger.log('Next steps:')
    logger.log('  npx canvas-notion sync')
    logger.log('  npx canvas-notion sync --dry-run')
    logger.log('  npx canvas-notion doctor')
    return nextConfig
  } finally {
    if (rl) {
      rl.close()
    }
  }
}

async function resolveValue({ interactive, rl, current, flagValue, prompt, fallback = '' }) {
  if (flagValue !== undefined) {
    return String(flagValue).trim()
  }
  if (current) {
    return String(current).trim()
  }
  if (!interactive) {
    if (fallback) return fallback
    throw new Error(`Missing required setup value: ${prompt}`)
  }
  const value = await rl.question(`${prompt}: `)
  return value.trim() || fallback
}

function assertRequiredSetupValues(config) {
  if (!config.canvas.baseUrl) throw new Error('Canvas base URL is required.')
  if (!config.canvas.token) throw new Error('Canvas token is required.')
  if (!config.notion.token) throw new Error('Notion token is required.')
  if (!config.notion.databaseId && !config.notion.parentPageId) {
    throw new Error('Provide either a Notion database ID or a parent page ID.')
  }
}

module.exports = { runSetup }
