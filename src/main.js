require('dotenv').config()
const { CanvasHelper } = require('./canvashelper')
const { NotionHelper } = require('./notionhelper')

async function run() {
  const canvas = new CanvasHelper()
  const notion = new NotionHelper()
  const courses = await canvas.getCourses()

  for (const course of courses) {
    const dbId = await notion.ensureDatabase(course)
    const existingURLs = await notion.getExistingURLs(dbId)
    const assignments = await canvas.getCourseAssignments(course.id)
    const discussions = await canvas.getCourseDiscussions(course.id)
    const allPages = [...assignments, ...discussions]

    // Determine new items
    const newPages = allPages.filter(p => !existingURLs.includes(p.URL.url))
    console.log(`Adding ${newPages.length} new items for ${course.name}`)

    // Create or update only new pages
    for (const props of newPages) {
      await notion.createOrUpdatePage(dbId, props)
    }
  }

  console.log('Sync complete.')
}

run()