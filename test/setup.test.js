const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { runSetup } = require('../src/setup')
const { DEFAULT_CONFIG } = require('../src/constants')

test('runSetup attaches to an existing database when a database URL is provided', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'canvas-notion-setup-'))
  const logs = []
  const databaseId = '11111111-1111-1111-1111-111111111111'
  const calls = {
    ensureDatabase: null
  }

  try {
    const config = JSON.parse(JSON.stringify(DEFAULT_CONFIG))
    const result = await runSetup({
      cwd: tempDir,
      config,
      scope: 'project',
      flags: {
        nonInteractive: true,
        canvasUrl: 'https://canvas.example.edu',
        canvasToken: 'canvas-token',
        notionToken: 'notion-token',
        databaseUrl: `https://www.notion.so/workspace/Assignments-${databaseId.replace(/-/g, '')}`,
        scope: 'all-active'
      },
      logger: {
        log(message) {
          logs.push(message)
        }
      },
      canvasProvider: {
        async verifyAccess() {}
      },
      notionProvider: {
        async verifyAccess() {},
        async ensureDatabase(args) {
          calls.ensureDatabase = args
          return databaseId
        }
      }
    })

    const savedConfig = JSON.parse(
      fs.readFileSync(path.join(tempDir, '.canvas-notion', 'config.json'), 'utf8')
    )

    assert.deepEqual(calls.ensureDatabase, {
      databaseId,
      parentPageId: '',
      title: 'Canvas Assignments'
    })
    assert.equal(result.notion.databaseId, databaseId)
    assert.equal(savedConfig.notion.databaseId, databaseId)
    assert.equal('parentPageId' in savedConfig.notion, false)
    assert.ok(logs.some((line) => line.includes('Configuration written to')))
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})
