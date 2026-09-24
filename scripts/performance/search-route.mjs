#!/usr/bin/env node

// Dependency-free regression/benchmark check for /api/search.
// With no BASE_URL it checks query shape and safety contracts. Point it at a local server to measure requests.

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const routePath = path.join(repoRoot, 'app', 'api', 'search', 'route.ts')

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function assertIncludes(source, snippets, message) {
  for (const snippet of snippets) {
    assert(source.includes(snippet), `${message}: missing ${JSON.stringify(snippet)}`)
  }
}

function assertExcludes(source, snippets, message) {
  for (const snippet of snippets) {
    assert(!source.includes(snippet), `${message}: found ${JSON.stringify(snippet)}`)
  }
}

function section(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker)
  const end = source.indexOf(endMarker, start)
  assert(start >= 0, `missing marker: ${startMarker}`)
  assert(end > start, `missing marker after ${startMarker}: ${endMarker}`)
  return source.slice(start, end)
}

async function checkQueryShape() {
  const source = await readFile(routePath, 'utf8')

  const numericStage = section(source, '// Unknown/blank/malformed numeric values', '// \'*\' = any run of characters')
  assertIncludes(numericStage, [
    "if (!value || !/^[+-]?\\d+$/.test(value)) return null",
    'return positive && n <= 0 ? null : n',
  ], 'strict integer parsing is missing')
  assertIncludes(source, [
    "const page = Math.max(1, parseIntParam(searchParams.get('page')) ?? 1)",
    "const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, parseIntParam(searchParams.get('limit')) ?? 20))",
    "const bookId = parseIntParam(searchParams.get('book_id'), { positive: true })",
    "const narratorId = parseIntParam(searchParams.get('narrator_id'), { positive: true })",
    "const subjectCatId = parseIntParam(searchParams.get('subject_cat_id'), { positive: true })",
    "const maxDepth = parseIntParam(searchParams.get('max_depth'), { positive: true })",
  ], 'strict integer defaults/filters are missing')
  assertExcludes(source, ["parseInt(raw, 10)"], 'search parameters still use permissive parseInt')
  assert(source.includes('WITH paged_hadiths AS MATERIALIZED ('), 'hadith search does not materialize a bounded ID/rank stage')
  assert(source.includes('WITH paged_service_content AS MATERIALIZED ('), 'service search does not materialize a bounded ID/rank stage')
  assert(source.includes('COUNT(*)::int AS total'), 'exact result count is missing')
  assert(source.includes("COUNT(*) FILTER (WHERE btrim(coalesce(tarqeem_matboa1, '')) <> '')::int AS hadiths"), 'exact printed-hadith count is missing')

  const hadithStage = section(source, 'const dataQuery = pool.query(', 'const textMatchCount')
  const boundedHadithIndex = hadithStage.indexOf('WITH paged_hadiths AS MATERIALIZED')
  const hadithLimitIndex = hadithStage.indexOf('LIMIT $2 OFFSET $3', boundedHadithIndex)
  const hadithEnrichmentIndex = hadithStage.indexOf('FROM paged_hadiths page')
  const hadithLateralIndex = hadithStage.indexOf('LEFT JOIN LATERAL', hadithEnrichmentIndex)
  assert(0 <= boundedHadithIndex && boundedHadithIndex < hadithLimitIndex, 'hadith LIMIT/OFFSET is not inside the bounded stage')
  assert(hadithLimitIndex < hadithEnrichmentIndex, 'hadith enrichment starts before pagination')
  assert(hadithEnrichmentIndex < hadithLateralIndex, 'hadith lateral enrichment is not after the bounded stage')
  assert(hadithStage.includes("searchRankDoc('h.tarf')"), 'hadith ranking is not bounded to the short indexed tarf document')
  assert(!hadithStage.includes("rankDoc('h.tarf', 'h.content')"), 'hadith ranking still reconstructs full content documents for every match')

  const serviceStage = section(source, 'const [serviceRes, serviceCountRes]', 'return NextResponse.json({\n      results: await attachMatnSnippets(serviceRes.rows')
  const boundedServiceIndex = serviceStage.indexOf('WITH paged_service_content AS MATERIALIZED')
  const serviceLimitIndex = serviceStage.indexOf('LIMIT $2 OFFSET $3', boundedServiceIndex)
  const serviceEnrichmentIndex = serviceStage.indexOf('FROM paged_service_content page')
  assert(0 <= boundedServiceIndex && boundedServiceIndex < serviceLimitIndex, 'service LIMIT/OFFSET is not inside the bounded stage')
  assert(serviceLimitIndex < serviceEnrichmentIndex, 'service enrichment starts before pagination')
  assert(serviceStage.includes("searchRankDoc('h.tarf')"), 'service ranking is not bounded to the short indexed tarf document')
  assert(!serviceStage.includes("rankDoc('h.tarf', 'h.content')"), 'service ranking still reconstructs full content documents for every match')

  const countStage = section(source, 'const countQuery = pool.query(', 'return NextResponse.json({')
  assert(countStage.includes('COUNT(*)::int AS total'), 'data and printed-hadith counts are not queried together')
  assert(countStage.includes('Promise.all([dataQuery, countQuery])'), 'data and count queries are no longer concurrent')
  assertIncludes(countStage, [
    'pool maximum and existing 30-second database timeout remain unchanged',
    'count errors still fail the request',
  ], 'concurrency decision is not documented conservatively')
  assert(!countStage.includes('snipColumns('), 'count query still computes snippets')

  const safetyStage = section(source, '// The existing left-to-right composer', '// Helper: build the text-match SQL expression')
  assertIncludes(safetyStage, [
    'const booleanTerms = q ? parseQueryTerms(q) : []',
    'const hasSearchableTextQuery = booleanTerms.some(t => hasSearchableText(t.term))',
    'const hasValidTextQuery = hasSearchableTextQuery && q.length >= MIN_QUERY_LENGTH',
    'if (q && !hasSearchableTextQuery) return emptySearchResponse()',
  ], 'degenerate-query guard is missing or is applied after SQL expression construction')
  assertIncludes(source, [
    'if (narratorId !== null && hasValidTextQuery)',
  ], 'mode-specific degenerate-query guard is missing')

  const wildcardStage = section(source, 'function wildcardToRegex', 'function parseMatch')
  assertIncludes(wildcardStage, [
    'const normalized = normalizeForWildcard(term)',
  ], 'wildcard regex literals are not normalized like indexed text')
  assertIncludes(source, [
    'const prefix = normalizeForWildcard(t.term.slice(0, -1).trim())',
    "t.regex !== null && /^[^*?]*\\*$/.test(t.term) && hasSearchableText(prefix)",
  ], 'trailing wildcard prefix is not normalized/guarded')

  const grammarStage = section(source, '// Supported Boolean grammar:', 'const booleanTerms =')
  assertIncludes(grammarStage, [
    'applied strictly left to right',
    'there are deliberately no precedence rules or user parentheses',
  ], 'Boolean grammar compatibility contract is not documented')

  const helperStage = section(source, 'function normalizeForWildcard', 'function parseMatch')
  assertIncludes(helperStage, [
    ".replace(/[\\u064B-\\u065F\\u0670\\u0671]/g, '')",
    ".replace(/[أإآ]/g, 'ا')",
    ".replace(/ة/g, 'ه')",
    ".replace(/ى/g, 'ي')",
  ], 'wildcard normalization is not aligned with normalize_hadith')

  console.log('PASS  static search query-shape checks')
  console.log('PASS  static search safety checks')
}

function isLocalBaseUrl(baseUrl) {
  const host = new URL(baseUrl).hostname.toLowerCase()
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]'
}

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.max(0, Math.ceil((sorted.length * p) / 100) - 1)
  return sorted[index]
}

function summary(values) {
  return {
    min: Math.round(Math.min(...values)),
    p50: Math.round(percentile(values, 50)),
    p95: Math.round(percentile(values, 95)),
    max: Math.round(Math.max(...values)),
  }
}

async function measureRequest(baseUrl, requestPath, sampleNumber) {
  const startedAt = performance.now()
  const response = await fetch(`${baseUrl}${requestPath}`, {
    headers: { 'user-agent': 'HadithSearchBenchmark/1.0' },
    signal: AbortSignal.timeout(35_000),
  })
  const headersAt = performance.now()

  if (!response.body) throw new Error('response has no body')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let ttfbMs
  let text = ''
  let decodedBytes = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (ttfbMs === undefined) ttfbMs = performance.now() - startedAt
    decodedBytes += value.byteLength
    text += decoder.decode(value, { stream: true })
  }
  text += decoder.decode()
  if (ttfbMs === undefined) ttfbMs = performance.now() - startedAt
  const totalMs = performance.now() - startedAt

  if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`)
  const body = JSON.parse(text)
  assert(Array.isArray(body.results), 'response.results is not an array')
  assert(Number.isInteger(body.total) && body.total >= 0, 'response.total is not a non-negative integer')

  const row = {
    sample: sampleNumber,
    status: response.status,
    totalMs: Math.round(totalMs),
    ttfbMs: Math.round(ttfbMs),
    headersMs: Math.round(headersAt - startedAt),
    decodedBytes,
    resultCount: body.results.length,
    totalMatches: body.total,
  }
  console.log(
    `  sample=${row.sample} status=${row.status} total=${row.totalMs}ms ` +
    `ttfb=${row.ttfbMs}ms bytes=${row.decodedBytes} results=${row.resultCount} matches=${row.totalMatches}`
  )
  return row
}

async function benchmark(baseUrl, samples) {
  const requests = [
    { name: 'hadith limit 1', path: `/api/search?q=${encodeURIComponent('الصلاة')}&limit=1` },
    { name: 'service limit 1', path: `/api/search?q=${encodeURIComponent('الصلاة')}&limit=1&src=service` },
  ]

  for (const request of requests) {
    const rows = []
    for (let sample = 1; sample <= samples; sample++) {
      rows.push(await measureRequest(baseUrl, request.path, sample))
    }
    console.log(
      `PASS  ${request.name}: total-ms=${JSON.stringify(summary(rows.map(r => r.totalMs)))} ` +
      `ttfb-ms=${JSON.stringify(summary(rows.map(r => r.ttfbMs)))} ` +
      `bytes=${JSON.stringify(summary(rows.map(r => r.decodedBytes)))}`
    )
  }
}

async function main() {
  await checkQueryShape()

  const baseUrl = (process.argv[2] || process.env.BASE_URL || '').replace(/\/$/, '')
  if (!baseUrl) {
    console.log('SKIP  HTTP benchmark (set BASE_URL or pass a local server URL)')
    return
  }
  if (!isLocalBaseUrl(baseUrl)) {
    throw new Error('refusing to benchmark a non-local BASE_URL; this check must never run a load test against production')
  }

  const requestedSamples = Number.parseInt(process.env.SEARCH_BENCHMARK_SAMPLES || '3', 10)
  const samples = Number.isFinite(requestedSamples)
    ? Math.min(20, Math.max(2, requestedSamples))
    : 3
  console.log(`Benchmarking sequential requests against local ${baseUrl} (${samples} samples/request)`)
  await benchmark(baseUrl, samples)
}

main().catch(error => {
  console.error(`FAIL  ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
