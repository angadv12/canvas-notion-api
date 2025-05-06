require('dotenv').config()

class CanvasHelper {
  constructor() {
    this.url = process.env.CANVAS_API_URL
    this.api = process.env.CANVAS_API
  }

  /** Fetches active, available courses and filters to the most recent term */
  async getCourses() {
    const url =
      `${this.url}/api/v1/courses?access_token=${this.api}` +
      `&enrollment_state=active&state[]=available&per_page=100`
    const res = await fetch(url)
    const courses = await res.json()
    if (!Array.isArray(courses)) return []

    const activeCourses = courses.filter(c => c.name)
    const termIds = activeCourses
      .map(c => c.enrollment_term_id)
      .filter(id => typeof id === 'number')
    const latestTerm = termIds.length ? Math.max(...termIds) : null

    const filtered = latestTerm
      ? activeCourses.filter(c => c.enrollment_term_id === latestTerm)
      : activeCourses.filter(c => !c.end_at || new Date(c.end_at) > new Date())

    return filtered.map(c => ({ id: String(c.id), name: c.name }))
  }

  async getCourseAssignments(courseID) {
    const res = await fetch(
      `${this.url}/api/v1/courses/${courseID}/assignments?access_token=${this.api}&per_page=100`
    )
    const items = await res.json()
    const list = Array.isArray(items) ? items : []
    return list
      .filter(a => a.name)
      .map(a => {
        const p = {
          'Assignment Name': {
            type: 'title',
            title: [{ type: 'text', text: { content: a.name } }]
          },
          URL: { type: 'url', url: a.html_url }
        }
        if (a.due_at) p['Due Date'] = { type: 'date', date: { start: a.due_at } }
        return p
      })
      .sort((a, b) => {
        const da = a['Due Date']?.date.start ? new Date(a['Due Date'].date.start) : Infinity
        const db = b['Due Date']?.date.start ? new Date(b['Due Date'].date.start) : Infinity
        return da - db
      })
  }

  async getCourseDiscussions(courseID) {
    const res = await fetch(
      `${this.url}/api/v1/courses/${courseID}/discussion_topics?access_token=${this.api}&per_page=100`
    )
    const items = await res.json()
    const list = Array.isArray(items) ? items : []
    return list
      .filter(d => d.title)
      .map(d => {
        const p = {
          'Assignment Name': {
            type: 'title',
            title: [{ type: 'text', text: { content: d.title } }]
          },
          URL: { type: 'url', url: d.html_url }
        }
        if (d.delayed_post_at || d.lock_at) {
          p['Due Date'] = { type: 'date', date: {} }
          if (d.delayed_post_at) p['Due Date'].date.start = d.delayed_post_at
          if (d.lock_at) p['Due Date'].date.end = d.lock_at
        }
        return p
      })
      .sort((a, b) => {
        const da = a['Due Date']?.date.start ? new Date(a['Due Date'].date.start) : Infinity
        const db = b['Due Date']?.date.start ? new Date(b['Due Date'].date.start) : Infinity
        return da - db
      })
  }
}

module.exports = { CanvasHelper }