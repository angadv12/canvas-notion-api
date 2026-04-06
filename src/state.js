const { nowIso } = require('./utils')
const { getPaths } = require('./paths')
const { readJson, writeJson } = require('./config')

function defaultState() {
  return {
    version: 1,
    databaseId: '',
    items: {}
  }
}

function loadState({ cwd, scope }) {
  const paths = getPaths(cwd)
  return readJson(paths[scope].state) || defaultState()
}

function saveState({ cwd, scope, state }) {
  const paths = getPaths(cwd)
  writeJson(paths[scope].state, {
    version: 1,
    databaseId: state.databaseId || '',
    items: state.items || {},
    updatedAt: nowIso()
  })
  return paths[scope].state
}

module.exports = {
  loadState,
  saveState,
  defaultState
}
