const { hashObject, mapWithConcurrency, parseLinkHeader, withRetry } = require('./utils')

class CanvasProvider {
  constructor(config) {
    this.baseUrl = config.canvas.baseUrl
    this.token = config.canvas.token
    this.timeoutMs = config.sync.requestTimeoutMs
    this.maxRetries = config.sync.maxRetries
  }

  async verifyAccess() {
    await this.getCourses({ scope: 'all-active' })
  }

  async getCourses({ scope = 'latest-term', courseFilter = [] } = {}) {
    const courses = await this.paginate('/api/v1/courses', {
      enrollment_state: 'active',
      per_page: '100',
      'state[]': 'available'
    })

    const namedCourses = courses.filter((course) => course && course.name)
    const scopedCourses = scope === 'all-active'
      ? namedCourses
      : filterLatestTermCourses(namedCourses)

    const filters = courseFilter.map((value) => String(value).trim().toLowerCase()).filter(Boolean)
    return scopedCourses
      .filter((course) => {
        if (!filters.length) return true
        return filters.some((filter) =>
          course.name.toLowerCase().includes(filter) || String(course.id) === filter
        )
      })
      .map((course) => ({
        id: String(course.id),
        name: course.name,
        enrollmentTermId: course.enrollment_term_id ? String(course.enrollment_term_id) : '',
        endAt: course.end_at || ''
      }))
  }

  async getWorkItemsForCourses(courses, { includeDiscussions = true, concurrency = 6 } = {}) {
    const allItems = await mapWithConcurrency(courses, concurrency, async (course) => {
      const [assignments, discussions] = await Promise.all([
        this.getAssignments(course),
        includeDiscussions ? this.getDiscussions(course) : Promise.resolve([])
      ])
      return [...assignments, ...discussions]
    })
    return allItems.flat()
  }

  async getAssignments(course) {
    const assignments = await this.paginate(`/api/v1/courses/${course.id}/assignments`, {
      per_page: '100'
    })
    return assignments
      .filter((assignment) => assignment && assignment.id && assignment.name)
      .map((assignment) => normalizeCanvasItem({
        course,
        type: 'assignment',
        item: assignment,
        title: assignment.name,
        url: assignment.html_url,
        dueStart: assignment.due_at,
        dueEnd: null,
        updatedAt: assignment.updated_at || assignment.due_at || null
      }))
      .sort(sortByDueDate)
  }

  async getDiscussions(course) {
    const discussions = await this.paginate(`/api/v1/courses/${course.id}/discussion_topics`, {
      per_page: '100'
    })
    return discussions
      .filter((discussion) => discussion && discussion.id && discussion.title)
      .map((discussion) => normalizeCanvasItem({
        course,
        type: 'discussion',
        item: discussion,
        title: discussion.title,
        url: discussion.html_url,
        dueStart: discussion.delayed_post_at || null,
        dueEnd: discussion.lock_at || null,
        updatedAt: discussion.updated_at || discussion.lock_at || discussion.delayed_post_at || null
      }))
      .sort(sortByDueDate)
  }

  async paginate(pathname, query = {}) {
    let nextUrl = buildUrl(this.baseUrl, pathname, query)
    const items = []

    while (nextUrl) {
      const response = await this.requestJson(nextUrl)
      if (!Array.isArray(response.body)) {
        return items
      }
      items.push(...response.body)
      const links = parseLinkHeader(response.headers.get('link'))
      nextUrl = links.next || null
    }

    return items
  }

  async requestJson(url) {
    return withRetry(async () => {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs)
      try {
        const response = await fetch(url, {
          headers: {
            Authorization: `Bearer ${this.token}`,
            Accept: 'application/json'
          },
          signal: controller.signal
        })
        if (!response.ok) {
          const body = await response.text()
          const error = new Error(`Canvas request failed with ${response.status}: ${body}`)
          error.status = response.status
          throw error
        }
        return {
          body: await response.json(),
          headers: response.headers
        }
      } finally {
        clearTimeout(timeout)
      }
    }, {
      retries: this.maxRetries,
      label: 'canvas request',
      shouldRetry: (error) => {
        if (error.name === 'AbortError') return true
        if (error.code === 'ECONNRESET') return true
        if (error.cause?.code === 'ECONNRESET') return true
        return error.status >= 500 || error.status === 429
      }
    })
  }
}

function buildUrl(baseUrl, pathname, query) {
  const url = new URL(pathname, baseUrl)
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.append(key, value)
    }
  }
  return url.toString()
}

function filterLatestTermCourses(courses) {
  const termIds = courses
    .map((course) => course.enrollment_term_id)
    .filter((termId) => typeof termId === 'number')

  if (termIds.length) {
    const latest = Math.max(...termIds)
    return courses.filter((course) => course.enrollment_term_id === latest)
  }

  const now = Date.now()
  return courses.filter((course) => !course.end_at || new Date(course.end_at).getTime() > now)
}

function normalizeCanvasItem({ course, type, item, title, url, dueStart, dueEnd, updatedAt }) {
  const normalized = {
    sourceKey: `${course.id}:${type}:${item.id}`,
    courseId: String(course.id),
    courseName: course.name,
    canvasId: String(item.id),
    itemType: type,
    title: title || 'Untitled Canvas Item',
    url: url || '',
    dueStart: dueStart || null,
    dueEnd: dueEnd || null,
    canvasUpdatedAt: updatedAt || null
  }

  normalized.sourceSignature = hashObject({
    courseId: normalized.courseId,
    courseName: normalized.courseName,
    canvasId: normalized.canvasId,
    itemType: normalized.itemType,
    title: normalized.title,
    url: normalized.url,
    dueStart: normalized.dueStart,
    dueEnd: normalized.dueEnd,
    canvasUpdatedAt: normalized.canvasUpdatedAt
  })

  return normalized
}

function sortByDueDate(left, right) {
  const leftValue = left.dueStart ? new Date(left.dueStart).getTime() : Number.POSITIVE_INFINITY
  const rightValue = right.dueStart ? new Date(right.dueStart).getTime() : Number.POSITIVE_INFINITY
  return leftValue - rightValue
}

module.exports = { CanvasProvider }
