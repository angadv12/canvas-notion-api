const CONFIG_DIR_NAME = '.canvas-notion'
const CONFIG_FILE_NAME = 'config.json'
const STATE_FILE_NAME = 'state.json'
const STATE_VERSION = 2
const DEFAULT_DATABASE_TITLE = 'Canvas Assignments'
const ITEM_TYPE_OPTIONS = ['assignment', 'discussion']

const LINKS = {
  canvasToken: 'https://community.canvaslms.com/t5/Canvas-Basics-Guide/How-do-I-manage-API-access-tokens-in-my-user-account/ta-p/615312',
  notionIntegrations: 'https://www.notion.so/my-integrations',
  notionConnections: 'https://www.notion.so/help/add-and-manage-connections-with-the-api'
}

const DEFAULT_CONFIG = {
  version: 1,
  canvas: {
    baseUrl: '',
    token: '',
    courseScope: 'latest-term'
  },
  notion: {
    token: '',
    parentPageId: '',
    databaseId: '',
    databaseTitle: DEFAULT_DATABASE_TITLE
  },
  sync: {
    deletionMode: 'archive',
    includeDiscussions: true,
    canvasConcurrency: 6,
    notionWriteConcurrency: 3,
    notionWriteDelayMs: 350,
    requestTimeoutMs: 60000,
    maxRetries: 3
  }
}

const REQUIRED_DATABASE_PROPERTIES = {
  'Assignment Name': 'title',
  Course: 'rich_text',
  'Course ID': 'rich_text',
  'Canvas ID': 'rich_text',
  'Item Type': 'select',
  URL: 'url',
  'Due Date': 'date',
  'Canvas Updated At': 'date',
  'Source Key': 'rich_text',
  'Source Signature': 'rich_text',
  Completion: 'checkbox'
}

module.exports = {
  CONFIG_DIR_NAME,
  CONFIG_FILE_NAME,
  STATE_FILE_NAME,
  STATE_VERSION,
  DEFAULT_DATABASE_TITLE,
  ITEM_TYPE_OPTIONS,
  DEFAULT_CONFIG,
  REQUIRED_DATABASE_PROPERTIES,
  LINKS
}
