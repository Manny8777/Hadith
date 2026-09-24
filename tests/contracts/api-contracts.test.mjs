import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assertArabicName,
  assertArray,
  assertInteger,
  assertJsonObject,
  assertKeys,
  assertNonNegativeCount,
  assertNumericId,
  assertOptionalString,
  getBaseUrl,
  invalidBaseUrlMessage,
  isMissingServerError,
  requestJson,
  skipMessage,
} from './helpers.mjs'
import { contractFixtures } from './fixtures.mjs'

const baseUrl = getBaseUrl()
const configuredBaseUrl = Boolean(process.env.BASE_URL?.trim())

/**
 * A missing BASE_URL is an intentionally skipped prerequisite. A supplied but
 * unreachable URL is handled the same way because there is no local test server
 * in this repository's test command. Once a server is reachable, HTTP errors,
 * non-JSON bodies, and contract mismatches fail normally.
 */
function withServer(name, fn) {
  test(name, async t => {
    if (!baseUrl) {
      t.skip(configuredBaseUrl ? invalidBaseUrlMessage() : skipMessage())
      return
    }
    try {
      await fn(t, baseUrl)
    } catch (error) {
      if (isMissingServerError(error)) {
        t.skip(`Skipped: test server at ${baseUrl} is unavailable.`)
        return
      }
      throw error
    }
  })
}

function assertListRows(rows, label, idKey) {
  assertArray(rows, label)
  for (const [index, row] of rows.entries()) {
    assertJsonObject(row, `${label}[${index}]`)
    if (idKey) assertNumericId(row[idKey], `${label}[${index}].${idKey}`, { min: 0, allowString: true })
  }
  return rows
}

function assertNoMoreThan(rows, limit, label) {
  assert.ok(rows.length <= limit, `${label} returned ${rows.length} rows; limit is ${limit}`)
}

withServer('/api/health returns a reachable health contract', async (_t, url) => {
  const { response, body } = await requestJson(url, '/api/health')
  assert.equal(response.status, 200, '/api/health must be 200 when the database is reachable')
  assertKeys(body, ['status', 'database', 'response_time_ms', 'timestamp'], '/api/health')
  assert.equal(body.status, 'ok')
  assert.equal(body.database, 'reachable')
  assertInteger(body.response_time_ms, '/api/health.response_time_ms', { min: 0 })
  assert.equal(typeof body.timestamp, 'string')
  assert.ok(Number.isFinite(Date.parse(body.timestamp)), '/api/health.timestamp must be an ISO date')
})

withServer('/api/hadith/:id returns a successful record contract', async (_t, url) => {
  const { response, body } = await requestJson(url, `/api/hadith/${contractFixtures.hadithId}`)
  assert.equal(response.status, 200)
  assertKeys(body, ['hadith', 'judgments', 'isnad'], '/api/hadith/:id')
  const hadith = assertJsonObject(body.hadith, '/api/hadith/:id.hadith')
  assert.equal(Number(hadith.main_id), contractFixtures.hadithId, '/api/hadith/:id.hadith.main_id must equal requested ID')
  assertNumericId(hadith.main_id, '/api/hadith/:id.hadith.main_id', { min: 1, allowString: true })
  assertNumericId(hadith.book_id, '/api/hadith/:id.hadith.book_id', { min: 1, allowString: true })
  assert.equal(typeof hadith.book_title, 'string')
  assert.ok(hadith.book_title.trim().length > 0, '/api/hadith/:id.hadith.book_title must be non-empty')
  assertArabicName(hadith.book_title, '/api/hadith/:id.hadith.book_title')
  assert.ok(Object.hasOwn(hadith, 'content'))
  assert.equal(typeof hadith.content, 'string')
  assertListRows(body.judgments, '/api/hadith/:id.judgments')
  for (const [index, row] of body.judgments.entries()) {
    assertOptionalString(row.say_text, `/api/hadith/:id.judgments[${index}].say_text`)
    assertOptionalString(row.scientist_name, `/api/hadith/:id.judgments[${index}].scientist_name`)
  }
  assertListRows(body.isnad, '/api/hadith/:id.isnad')
  assertNoMoreThan(body.isnad, 5, '/api/hadith/:id.isnad')
  for (const [index, row] of body.isnad.entries()) {
    assertArray(row.narrator_id_array, `/api/hadith/:id.isnad[${index}].narrator_id_array`)
    for (const [narratorIndex, narratorId] of row.narrator_id_array.entries()) {
      assertNumericId(narratorId, `/api/hadith/:id.isnad[${index}].narrator_id_array[${narratorIndex}]`, { min: 1 })
    }
  }
})

withServer('/api/hadith/:id/services returns flags or an empty successful object', async (_t, url) => {
  const { response, body } = await requestJson(url, `/api/hadith/${contractFixtures.hadithId}/services`)
  assert.equal(response.status, 200)
  assertJsonObject(body, '/api/hadith/:id/services')
  assert.ok(Object.keys(body).length === 0 || Object.hasOwn(body, 'hadith_id'))
  if (Object.hasOwn(body, 'hadith_id')) {
    assert.equal(Number(body.hadith_id), contractFixtures.hadithId)
    assertNumericId(body.hadith_id, '/api/hadith/:id/services.hadith_id', { min: 1, allowString: true })
    for (const [key, value] of Object.entries(body)) {
      if (key === 'hadith_id') continue
      assert.equal(typeof value, 'boolean', `/api/hadith/:id/services.${key} must be boolean when present`)
    }
  }
})

withServer('/api/hadith/:id/commentary preserves bounded empty content', async (_t, url) => {
  const { response, body } = await requestJson(url, `/api/hadith/${contractFixtures.commentaryHadithId}/commentary`)
  assert.equal(response.status, 200)
  assertKeys(body, ['typeGroups', 'contentRows', 'selectedTypeId'], '/api/hadith/:id/commentary')
  assertListRows(body.typeGroups, '/api/hadith/:id/commentary.typeGroups')
  for (const [index, group] of body.typeGroups.entries()) {
    assertNumericId(group.type_id, `commentary.typeGroups[${index}].type_id`, { min: 1, allowString: true })
  }
  assertListRows(body.contentRows, '/api/hadith/:id/commentary.contentRows')
  assertNoMoreThan(body.contentRows, 100, '/api/hadith/:id/commentary.contentRows')
  for (const [index, group] of body.typeGroups.entries()) {
    assert.equal(typeof group.type_name, 'string')
    assert.ok(group.type_name.trim().length > 0, `commentary.typeGroups[${index}].type_name must be non-empty`)
    assertArabicName(group.type_name, `commentary.typeGroups[${index}].type_name`)
    assertNonNegativeCount(group.count, `commentary.typeGroups[${index}].count`)
  }
  for (const [index, row] of body.contentRows.entries()) {
    assertNumericId(row.id, `commentary.contentRows[${index}].id`, { min: 1, allowString: true })
    assertOptionalString(row.book_name, `commentary.contentRows[${index}].book_name`)
    if (row.book_name !== null && row.book_name !== undefined) {
      assertArabicName(row.book_name, `commentary.contentRows[${index}].book_name`)
    }
    assertOptionalString(row.section_text, `commentary.contentRows[${index}].section_text`)
    assertOptionalString(row.tarf, `commentary.contentRows[${index}].tarf`)
    assertOptionalString(row.content, `commentary.contentRows[${index}].content`)
  }
  assert.ok(body.selectedTypeId === null || Number.isSafeInteger(body.selectedTypeId))
  if (body.selectedTypeId !== null) {
    assert.ok(body.selectedTypeId > 0, '/api/hadith/:id/commentary.selectedTypeId must be positive when set')
  }
  if (body.typeGroups.length === 0) {
    assert.equal(body.contentRows.length, 0, 'commentary with no groups must have no content rows')
    assert.equal(body.selectedTypeId, null, 'commentary with no groups must have no selected type')
  }
})

withServer('/api/topics/item/:id returns a bounded topic contract', async (_t, url) => {
  const { response, body } = await requestJson(url, `/api/topics/item/${contractFixtures.topicId}`)
  assert.equal(response.status, 200)
  assertKeys(body, ['item', 'parent', 'children', 'hadiths', 'total', 'direct_total', 'has_children', 'page', 'limit', 'pages', 'mode'], '/api/topics/item/:id')
  assert.equal(typeof body.item, 'object')
  const item = assertJsonObject(body.item, '/api/topics/item/:id.item')
  assert.equal(Number(item.id), contractFixtures.topicId)
  assertNumericId(item.id, '/api/topics/item/:id.item.id', { min: 1 })
  assert.ok(item.title !== null && item.title !== undefined, '/api/topics/item/:id.item.title is required')
  if (body.parent !== null) {
    const parent = assertJsonObject(body.parent, '/api/topics/item/:id.parent')
    assertNumericId(parent.id, '/api/topics/item/:id.parent.id', { min: 1 })
  }
  assertListRows(body.children, '/api/topics/item/:id.children', 'id')
  assertListRows(body.hadiths, '/api/topics/item/:id.hadiths', 'main_id')
  for (const [index, row] of body.hadiths.entries()) {
    assertNumericId(row.main_id, `topics.item.hadiths[${index}].main_id`, { min: 1, allowString: true })
  }
  if (body.mode === 'hadiths' && body.hadiths.length === 0) {
    assert.equal(Number(body.total), 0, 'topic with no direct hadiths must report total=0')
  }
  for (const [index, row] of body.children.entries()) {
    assertNumericId(row.id, `topics.item.children[${index}].id`, { min: 1, allowString: true })
  }
  assertNoMoreThan(body.children, body.limit, '/api/topics/item/:id.children')
  assertNoMoreThan(body.hadiths, body.limit, '/api/topics/item/:id.hadiths')
  assertInteger(body.page, '/api/topics/item/:id.page', { min: 1 })
  assertInteger(body.limit, '/api/topics/item/:id.limit', { min: 1, max: 20 })
  assertInteger(body.total, '/api/topics/item/:id.total', { min: 0 })
  assertInteger(body.pages, '/api/topics/item/:id.pages', { min: 0 })
  assertNonNegativeCount(body.direct_total, '/api/topics/item/:id.direct_total')
  if (body.mode === 'hadiths') {
    assertNonNegativeCount(body.child_total, '/api/topics/item/:id.child_total')
  }
  assert.equal(typeof body.has_children, 'boolean')
  assert.ok(['children', 'hadiths'].includes(body.mode), '/api/topics/item/:id.mode must be children or hadiths')
  assert.equal(body.mode, body.has_children ? 'children' : 'hadiths', 'topic mode must follow the requested default view')
  assert.equal(body.pages, Math.ceil(Number(body.total) / body.limit), 'topic pages must agree with total and limit')
  for (const [index, row] of body.children.entries()) {
    assertInteger(row.left_value, `/api/topics/item/:id.children[${index}].left_value`)
    assert.equal(typeof row.is_leaf, 'boolean')
    assert.equal(typeof row.title, 'string')
    assert.ok(row.title.trim().length > 0, `topics.item.children[${index}].title must be non-empty`)
    assertArabicName(row.title, `topics.item.children[${index}].title`)
    assertNonNegativeCount(row.hadith_count, `/api/topics/item/:id.children[${index}].hadith_count`)
  }
  for (const [index, row] of body.hadiths.entries()) {
    assertNumericId(row.book_id, `/api/topics/item/:id.hadiths[${index}].book_id`, { min: 1, allowString: true })
    assert.equal(typeof row.book_title, 'string')
    assert.ok(row.book_title.trim().length > 0, `topics.item.hadiths[${index}].book_title must be non-empty`)
    assertArabicName(row.book_title, `topics.item.hadiths[${index}].book_title`)
  }
})

withServer('/api/narrator/:id returns relation arrays and Arabic source names', async (_t, url) => {
  const { response, body } = await requestJson(url, `/api/narrator/${contractFixtures.narratorId}`)
  assert.equal(response.status, 200)
  assertKeys(body, ['narrator', 'books', 'students', 'teachers', 'criticism', 'biography'], '/api/narrator/:id')
  const narrator = assertJsonObject(body.narrator, '/api/narrator/:id.narrator')
  assert.equal(Number(narrator.id), contractFixtures.narratorId)
  assertNumericId(narrator.id, '/api/narrator/:id.narrator.id', { min: 1 })
  // The endpoint only succeeds when a narrator source row exists, so a populated
  // Arabic name is part of the UI-facing contract.
  assertArabicName(narrator.name, '/api/narrator/:id.narrator.name')
  assertListRows(body.books, '/api/narrator/:id.books')
  assertListRows(body.teachers, '/api/narrator/:id.teachers')
  assertListRows(body.students, '/api/narrator/:id.students')
  for (const [collection, rows] of [['books', body.books], ['teachers', body.teachers], ['students', body.students]]) {
    for (const [index, row] of rows.entries()) {
      assertNumericId(row.id, `/api/narrator/:id.${collection}[${index}].id`, { min: 1 })
    }
  }
  assertListRows(body.criticism, '/api/narrator/:id.criticism')
  assertListRows(body.biography, '/api/narrator/:id.biography')
  assertNoMoreThan(body.teachers, 100, '/api/narrator/:id.teachers')
  assertNoMoreThan(body.students, 100, '/api/narrator/:id.students')
  for (const [index, book] of body.books.entries()) {
    assert.equal(typeof book.title, 'string')
    assert.ok(book.title.trim().length > 0, `narrator.books[${index}].title must be non-empty`)
    assertArabicName(book.title, `narrator.books[${index}].title`)
    assertNonNegativeCount(book.hadith_count, `narrator.books[${index}].hadith_count`)
  }
  for (const [collection, rows] of [['teachers', body.teachers], ['students', body.students]]) {
    for (const [index, row] of rows.entries()) {
      assertArabicName(row.name, `/api/narrator/:id.${collection}[${index}].name`)
    }
  }
  for (const [index, group] of body.criticism.entries()) {
    assert.equal(typeof group.scientist_name, 'string')
    assert.ok(group.scientist_name.trim().length > 0, `narrator.criticism[${index}].scientist_name must be non-empty`)
    assertArray(group.texts, `narrator.criticism[${index}].texts`)
    for (const [textIndex, text] of group.texts.entries()) {
      assertOptionalString(text, `narrator.criticism[${index}].texts[${textIndex}]`)
    }
  }
  for (const [index, book] of body.biography.entries()) {
    assertNumericId(book.book_id, `narrator.biography[${index}].book_id`, { min: 1, nullable: true, allowString: true })
    assert.equal(typeof book.book_name, 'string')
    assert.ok(book.book_name.trim().length > 0, `narrator.biography[${index}].book_name must be non-empty`)
    assertArabicName(book.book_name, `narrator.biography[${index}].book_name`)
    for (const [entryIndex, entry] of book.entries.entries()) {
      assertOptionalString(entry.content, `narrator.biography[${index}].entries[${entryIndex}].content`)
      assertOptionalString(entry.title, `narrator.biography[${index}].entries[${entryIndex}].title`)
    }
    assertListRows(book.entries, `narrator.biography[${index}].entries`)
  }
})

withServer('/api/search supports bounded pages and Arabic results', async (_t, url) => {
  const path = `/api/search?q=${encodeURIComponent(contractFixtures.searchQuery)}&limit=100000`
  const { response, body } = await requestJson(url, path)
  assert.equal(response.status, 200)
  assertKeys(body, ['results', 'total', 'total_hadiths', 'page', 'limit', 'mode', 'search_scope', 'match'], '/api/search')
  assertListRows(body.results, '/api/search.results', 'main_id')
  for (const [index, row] of body.results.entries()) {
    assertNumericId(row.main_id, `search.results[${index}].main_id`, { min: 1, allowString: true })
  }
  assert.ok(body.results.length <= body.limit, '/api/search.results must not exceed the requested limit')
  assert.ok(Number(body.total) >= body.results.length, '/api/search.total must cover the returned page')
  assertInteger(body.page, '/api/search.page', { min: 1 })
  assertInteger(body.limit, '/api/search.limit', { min: 1, max: 100 })
  assertNonNegativeCount(body.total, '/api/search.total')
  assertNonNegativeCount(body.total_hadiths, '/api/search.total_hadiths')
  assert.ok(Number(body.total_hadiths) <= Number(body.total), '/api/search.total_hadiths must not exceed total')
  assert.equal(body.mode, 'text', '/api/search with q and no source must use text mode')
  assert.equal(body.search_scope, 'both', '/api/search default scope must search tarf and content')
  assert.equal(body.match, 'phrase', '/api/search default match must be phrase')
  for (const [index, row] of body.results.entries()) {
    assertNumericId(row.book_id, `/api/search.results[${index}].book_id`, { min: 1, allowString: true })
    assert.equal(typeof row.book_name, 'string')
    assert.ok(row.book_name.trim().length > 0, `search.results[${index}].book_name must be non-empty`)
    assertArabicName(row.book_name, `search.results[${index}].book_name`)
  }
  for (const [index, row] of body.results.entries()) {
    assertOptionalString(row.tarf, `/api/search.results[${index}].tarf`)
    if (Object.hasOwn(row, 'content')) {
      assertOptionalString(row.content, `/api/search.results[${index}].content`)
    }
    if (Object.hasOwn(row, 'snippet')) {
      assert.ok(row.snippet === null || Array.isArray(row.snippet), `/api/search.results[${index}].snippet must be an array or null`)
      if (Array.isArray(row.snippet)) {
        for (const [partIndex, part] of row.snippet.entries()) {
          assertJsonObject(part, `/api/search.results[${index}].snippet[${partIndex}]`)
          assert.equal(typeof part.t, 'string')
          assert.equal(typeof part.hit, 'boolean')
        }
      }
    }
  }
})

withServer('/api/search accepts a successful empty result', async (_t, url) => {
  const path = `/api/search?q=${encodeURIComponent(contractFixtures.degenerateQuery)}&limit=5`
  const { response, body } = await requestJson(url, path)
  assert.equal(response.status, 200)
  assertKeys(body, ['results', 'total'], '/api/search empty')
  assertListRows(body.results, '/api/search empty.results')
  assertNonNegativeCount(body.total, '/api/search empty.total')
  assert.equal(Number(body.total), 0, 'a degenerate query should return no results')
  assert.equal(body.results.length, 0, 'a degenerate query should return an empty results array')
})

withServer('/api/hadith/:id returns a successful 404 for a missing numeric ID', async (_t, url) => {
  const { response, body } = await requestJson(url, `/api/hadith/${contractFixtures.emptyId}`)
  assert.equal(response.status, 404)
  assertKeys(body, ['error'], '/api/hadith/:id missing-id response')
  assert.equal(body.error, 'not found')
})

withServer('/api/hadith/:id rejects a non-numeric ID', async (_t, url) => {
  const { response, body } = await requestJson(url, `/api/hadith/${encodeURIComponent(contractFixtures.invalidId)}`)
  assert.equal(response.status, 400)
  assertJsonObject(body, '/api/hadith/:id invalid-id response')
  assert.equal(body.error, 'invalid id')
})

withServer('/api/hadith/:id/services accepts a missing numeric ID with an empty object', async (_t, url) => {
  const { response, body } = await requestJson(url, `/api/hadith/${contractFixtures.emptyId}/services`)
  assert.equal(response.status, 200)
  assertJsonObject(body, '/api/hadith/:id/services empty-id response')
  assert.deepEqual(body, {})
})

withServer('/api/hadith/:id/services rejects a non-numeric ID', async (_t, url) => {
  const { response, body } = await requestJson(url, `/api/hadith/${encodeURIComponent(contractFixtures.invalidId)}/services`)
  assert.equal(response.status, 400)
  assert.equal(body.error, 'invalid id')
})

withServer('/api/hadith/:id/commentary accepts a missing numeric ID with empty groups', async (_t, url) => {
  const { response, body } = await requestJson(url, `/api/hadith/${contractFixtures.emptyId}/commentary`)
  assert.equal(response.status, 200)
  assertKeys(body, ['typeGroups', 'contentRows', 'selectedTypeId'], '/api/hadith/:id/commentary empty-id response')
  assert.deepEqual(body.typeGroups, [])
  assert.deepEqual(body.contentRows, [])
  assert.equal(body.selectedTypeId, null)
})

withServer('/api/hadith/:id/commentary rejects a non-numeric ID', async (_t, url) => {
  const { response, body } = await requestJson(url, `/api/hadith/${encodeURIComponent(contractFixtures.invalidId)}/commentary`)
  assert.equal(response.status, 400)
  assert.equal(body.error, 'invalid id')
})

withServer('/api/topics/item/:id returns a successful 404 for a missing numeric ID', async (_t, url) => {
  const { response, body } = await requestJson(url, `/api/topics/item/${contractFixtures.emptyId}`)
  assert.equal(response.status, 404)
  assert.equal(body.error, 'not found')
})

withServer('/api/topics/item/:id rejects a non-numeric ID', async (_t, url) => {
  const { response, body } = await requestJson(url, `/api/topics/item/${encodeURIComponent(contractFixtures.invalidId)}`)
  assert.equal(response.status, 400)
  assert.equal(body.error, 'invalid id')
})

withServer('/api/narrator/:id returns a successful 404 for a missing numeric ID', async (_t, url) => {
  const { response, body } = await requestJson(url, `/api/narrator/${contractFixtures.emptyId}`)
  assert.equal(response.status, 404)
  assert.equal(body.error, 'Narrator not found')
})

withServer('/api/narrator/:id rejects a non-numeric ID', async (_t, url) => {
  const { response, body } = await requestJson(url, `/api/narrator/${encodeURIComponent(contractFixtures.invalidId)}`)
  assert.equal(response.status, 400)
  assert.equal(body.error, 'Invalid ID')
})

withServer('/api/search bounds a zero limit to one', async (_t, url) => {
  const { response, body } = await requestJson(url, `/api/search?narrator_id=0&limit=0&page=-7`)
  assert.equal(response.status, 200)
  assertKeys(body, ['results', 'total', 'page', 'limit', 'mode'], '/api/search degenerate pagination')
  assertListRows(body.results, '/api/search degenerate pagination.results')
  assert.equal(body.page, 1)
  assert.equal(body.limit, 1)
  assert.ok(body.results.length <= 1)
  assertNonNegativeCount(body.total, '/api/search degenerate pagination.total')
})
