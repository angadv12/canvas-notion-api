const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { loadConfig, saveConfig } = require('../src/config')
const { parseArgv } = require('../src/cli')

test('project config overrides global config and env overrides project config', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'canvas-notion-config-'))
  const originalHome = process.env.HOME

  try {
    process.env.HOME = tempDir

    saveConfig({
      cwd: tempDir,
      scope: 'global',
      config: {
        canvas: { baseUrl: 'https://global.example', token: 'global-token' },
        notion: { token: 'global-notion', databaseId: '11111111111111111111111111111111' }
      }
    })

    saveConfig({
      cwd: tempDir,
      scope: 'project',
      config: {
        canvas: { baseUrl: 'https://project.example', token: 'project-token' }
      }
    })

    const loaded = loadConfig({
      cwd: tempDir,
      env: {
        CANVAS_NOTION_CANVAS_TOKEN: 'env-token'
      }
    })

    assert.equal(loaded.config.canvas.baseUrl, 'https://project.example')
    assert.equal(loaded.config.canvas.token, 'env-token')
    assert.equal(loaded.config.notion.token, 'global-notion')
    assert.equal(loaded.activeScope, 'project')
  } finally {
    process.env.HOME = originalHome
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})

test('parseArgv handles commands, booleans, and value flags', () => {
  const parsed = parseArgv([
    'sync',
    '--dry-run',
    '--scope',
    'all-active',
    '--course=db',
    '--include-discussions=false'
  ])

  assert.equal(parsed.command, 'sync')
  assert.equal(parsed.flags.dryRun, true)
  assert.equal(parsed.flags.scope, 'all-active')
  assert.equal(parsed.flags.course, 'db')
  assert.equal(parsed.flags.includeDiscussions, 'false')
})


test('missing env and flags do not clear persisted notion identifiers', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'canvas-notion-config-'))
  const originalHome = process.env.HOME

  try {
    process.env.HOME = tempDir

    saveConfig({
      cwd: tempDir,
      scope: 'global',
      config: {
        notion: {
          token: 'global-notion',
          parentPageId: '22222222222222222222222222222222',
          databaseId: '11111111111111111111111111111111'
        }
      }
    })

    const loaded = loadConfig({ cwd: tempDir, env: {} })

    assert.equal(loaded.config.notion.parentPageId, '22222222-2222-2222-2222-222222222222')
    assert.equal(loaded.config.notion.databaseId, '11111111-1111-1111-1111-111111111111')
  } finally {
    process.env.HOME = originalHome
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})


test('loadConfig preserves hyphenated persisted notion ids', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'canvas-notion-config-'))
  const originalHome = process.env.HOME

  try {
    process.env.HOME = tempDir

    saveConfig({
      cwd: tempDir,
      scope: 'global',
      config: {
        notion: {
          token: 'global-notion',
          parentPageId: '22222222-2222-2222-2222-222222222222',
          databaseId: '11111111-1111-1111-1111-111111111111'
        }
      }
    })

    const loaded = loadConfig({ cwd: tempDir, env: {} })

    assert.equal(loaded.config.notion.parentPageId, '22222222-2222-2222-2222-222222222222')
    assert.equal(loaded.config.notion.databaseId, '11111111-1111-1111-1111-111111111111')
  } finally {
    process.env.HOME = originalHome
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})
