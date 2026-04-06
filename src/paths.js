const os = require('os')
const path = require('path')
const {
  CONFIG_DIR_NAME,
  CONFIG_FILE_NAME,
  STATE_FILE_NAME
} = require('./constants')

function getGlobalConfigRoot() {
  if (process.platform === 'win32') {
    return process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support')
  }
  return process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config')
}

function getPaths(cwd) {
  const projectDir = path.join(cwd, CONFIG_DIR_NAME)
  const globalDir = path.join(getGlobalConfigRoot(), 'canvas-notion')

  return {
    project: {
      dir: projectDir,
      config: path.join(projectDir, CONFIG_FILE_NAME),
      state: path.join(projectDir, STATE_FILE_NAME)
    },
    global: {
      dir: globalDir,
      config: path.join(globalDir, CONFIG_FILE_NAME),
      state: path.join(globalDir, STATE_FILE_NAME)
    }
  }
}

module.exports = { getPaths }
