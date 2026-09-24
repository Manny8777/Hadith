#!/usr/bin/env node

import { randomBytes } from 'node:crypto'
import { lstatSync, realpathSync, statSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { fileURLToPath, pathToFileURL } from 'node:url'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(SCRIPT_DIR, '../..')
const DEFAULT_BASE_URL = 'http://127.0.0.1:3000'
const DEFAULT_SAMPLES = 3
const MAX_SAMPLES = 10
const DEFAULT_TIMEOUT_MS = 10_000
const MIN_TIMEOUT_MS = 100
const MAX_TIMEOUT_MS = 120_000
export const MAX_RESPONSE_BYTES = 8 * 1024 * 1024
const REQUEST_GAP_MS = 100
const CONSECUTIVE_ERROR_LIMIT = 2
const REPEATED_5XX_LIMIT = 2
const MAX_DATABASE_INTEGER = 2_147_483_647
const PROBE_TIMEOUT_MS = 2_000
const CACHE_HEADER_NAMES = [
  'cache-control',
  'age',
  'etag',
  'expires',
  'vary',
  'x-cache',
  'x-cache-hits',
  'x-nextjs-cache',
  'cf-cache-status',
  'x-vercel-cache',
]
const CACHE_HEADER_KEYS = {
  'cache-control': 'cache_control',
  age: 'age',
  etag: 'etag',
  expires: 'expires',
  vary: 'vary',
  'x-cache': 'x_cache',
  'x-cache-hits': 'x_cache_hits',
  'x-nextjs-cache': 'x_nextjs_cache',
  'cf-cache-status': 'cf_cache_status',
  'x-vercel-cache': 'x_vercel_cache',
}
const PROTECTED_SOURCE_DIRS = [
  '.git',
  '.next',
  'app',
  'db',
  'lib',
  'node_modules',
  'public',
  'scripts',
  'tests',
]
const ALLOWED_IN_REPO_OUTPUT_DIR = 'db-backup'
const OPTION_NAMES = new Map([
  ['--base-url', 'baseUrl'],
  ['--output-dir', 'outputDir'],
  ['--samples', 'samples'],
  ['--timeout-ms', 'timeoutMs'],
])
const BOOLEAN_OPTIONS = new Map([
  ['--help', 'help'],
  ['-h', 'help'],
  ['--json', 'json'],
])

function printHelp() {
  console.log(`Safe, sequential HTTP GET performance baseline

Usage:
  node scripts/performance/route-baseline.mjs [options]

Options:
  --base-url <url>       Target origin/base URL (default: ${DEFAULT_BASE_URL})
  --samples <1-${MAX_SAMPLES}>       Samples per route (default: ${DEFAULT_SAMPLES})
  --timeout-ms <ms>      Per-request timeout, ${MIN_TIMEOUT_MS}-${MAX_TIMEOUT_MS} (default: ${DEFAULT_TIMEOUT_MS})
  --output-dir <path>    Report directory (default: db-backup/performance)
  --json                 Emit the complete JSON report to stdout
  -h, --help             Show this help without making requests

Environment equivalents:
  BASE_URL, PERF_SAMPLES (or PERF_SAMPLE_COUNT), PERF_TIMEOUT_MS (or PERF_TIMEOUT),
  PERF_OUTPUT_DIR, PERF_JSON

Optional fixture IDs (positive database integers):
  PERF_HADITH_ID          Hadith/takhrij route ID (default: 5)
  PERF_TAKHRIJ_HADITH_ID  Takhrij API ID (default: PERF_HADITH_ID)
  PERF_NARRATOR_ID        Narrator ID (default: 9)
  PERF_TOPIC_ID           Topic item ID (default: 759)
  PERF_TAKHRIJ_GROUP_ID   Optional takhrij-spread group ID
  PERF_TAKHRIJ_ALLOW_EMPTY
                          Accept an explicit empty takhrij response for a known-empty
                          fixture (default: false)

Representative GET routes:
  /api/health
  /api/search?q=الصلاة&page=1&limit=1
  /api/hadith/:id
  /api/narrator/:id
  /api/hadith/:takhrijId/takhrij
  /hadiths/takhrij-spread?minBooks=3&page=1
  /hadiths/services-index
  /api/topics/item/:id?view=hadiths&page=1

Safety:
  * GET only, sequential only, redirects are not followed, and no auth/env secrets are read.
  * At most ${MAX_SAMPLES} requests per route; response bodies are capped at ${MAX_RESPONSE_BYTES} bytes.
  * Only validated 2xx responses contribute to successful latency/TTFB statistics.
  * Timeouts and errors keep their measured duration but have latency_ms=null.
  * Two consecutive 5xx responses stop the run; repeated malformed responses also stop that route.
  * Reports are new .json files written with exclusive-create semantics, never over existing files.
  * In-repository output is resolved against symlinks/junctions and must remain under ignored db-backup/; explicit external paths are also supported.
  * A missing local loopback target skips with exit code 0; any unreachable non-loopback target exits with code 2.
  * This is a baseline, not a production load test. Keep PERF_SAMPLES=1 for shared environments.

If a loopback target is not listening, the local run skips with exit code 0.
If any non-loopback target is unreachable, it exits with code 2.

Example:
  node scripts/performance/route-baseline.mjs --samples 1 --json
`)
}

function parseArgs(argv) {
  const result = { help: false, json: false }

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (BOOLEAN_OPTIONS.has(argument)) {
      result[BOOLEAN_OPTIONS.get(argument)] = true
      continue
    }

    const equalsAt = argument.indexOf('=')
    const option = equalsAt >= 0 ? argument.slice(0, equalsAt) : argument
    const targetKey = OPTION_NAMES.get(option)
    if (!targetKey) throw new Error(`unknown option: ${option}`)

    let value
    if (equalsAt >= 0) {
      value = argument.slice(equalsAt + 1)
    } else {
      value = argv[index + 1]
      index += 1
    }
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`missing value for ${option}`)
    }
    result[targetKey] = value
  }

  return result
}

export function parseBoundedInteger(rawValue, fallback, min, max, label) {
  if (rawValue === undefined || String(rawValue).trim() === '') return fallback
  const text = String(rawValue).trim()
  if (!/^\d+$/.test(text)) throw new Error(`${label} must be an integer from ${min} to ${max}`)

  const value = Number(text)
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`${label} must be an integer from ${min} to ${max}`)
  }
  return value
}

export function parseFixtureId(name, rawValue, fallback) {
  if (rawValue === undefined || String(rawValue).trim() === '') return fallback
  const text = String(rawValue).trim()
  if (!/^[1-9]\d{0,9}$/.test(text) || Number(text) > MAX_DATABASE_INTEGER) {
    throw new Error(`${name} must be a positive database integer no greater than ${MAX_DATABASE_INTEGER}`)
  }
  return Number(text)
}

function isPathWithin(candidate, root) {
  const relative = path.relative(root, candidate)
  return relative === '' || (
    relative !== '..'
    && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative)
  )
}

function canonicalPath(candidate) {
  const absolute = path.resolve(candidate)
  const missingSegments = []
  let existingPath = absolute

  while (true) {
    try {
      const resolvedExistingPath = realpathSync(existingPath)
      return path.resolve(resolvedExistingPath, ...missingSegments)
    } catch (error) {
      if (!error || !['ENOENT', 'ENOTDIR'].includes(error.code)) throw error

      try {
        const linkStats = lstatSync(existingPath)
        if (linkStats.isSymbolicLink()) {
          throw new Error(`output path component is an unresolved symlink or junction: ${existingPath}`)
        }
      } catch (linkError) {
        if (linkError?.code !== 'ENOENT') throw linkError
      }

      const parent = path.dirname(existingPath)
      if (parent === existingPath) return absolute
      missingSegments.unshift(path.basename(existingPath))
      existingPath = parent
    }
  }
}

function pathKeysEqual(left, right) {
  const leftKey = path.resolve(left)
  const rightKey = path.resolve(right)
  return process.platform === 'win32'
    ? leftKey.toLowerCase() === rightKey.toLowerCase()
    : leftKey === rightKey
}

function assertExistingPathIsDirectory(candidate) {
  try {
    const linkStats = lstatSync(candidate)
    if (linkStats.isSymbolicLink()) {
      const targetStats = statSync(candidate)
      if (!targetStats.isDirectory()) {
        throw new Error('output directory path resolves to a non-directory')
      }
    } else if (!linkStats.isDirectory()) {
      throw new Error('output directory path is not a directory')
    }
  } catch (error) {
    if (error?.code === 'ENOENT') return
    throw error
  }
}

function assertOutputDirectoryContainment(candidate, repoRoot) {
  const resolvedRepoRoot = path.resolve(repoRoot)
  assertExistingPathIsDirectory(resolvedRepoRoot)
  const canonicalRepoRoot = canonicalPath(resolvedRepoRoot)
  assertExistingPathIsDirectory(candidate)
  const canonicalCandidate = canonicalPath(candidate)
  const candidateIsLexicallyInRepo = isPathWithin(candidate, resolvedRepoRoot)

  if (pathKeysEqual(candidate, resolvedRepoRoot) || pathKeysEqual(canonicalCandidate, canonicalRepoRoot)) {
    throw new Error('output directory must not be the repository root')
  }

  if (candidateIsLexicallyInRepo) {
    const allowedDirectory = path.resolve(resolvedRepoRoot, ALLOWED_IN_REPO_OUTPUT_DIR)
    if (!isPathWithin(candidate, allowedDirectory)) {
      throw new Error(
        `in-repository output must be inside ignored ${ALLOWED_IN_REPO_OUTPUT_DIR}/`,
      )
    }
    const canonicalAllowedDirectory = canonicalPath(allowedDirectory)
    if (
      !isPathWithin(canonicalAllowedDirectory, canonicalRepoRoot)
      || !isPathWithin(canonicalCandidate, canonicalAllowedDirectory)
    ) {
      throw new Error(
        `in-repository output must resolve inside ignored ${ALLOWED_IN_REPO_OUTPUT_DIR}/`,
      )
    }
  }

  for (const relativeProtected of PROTECTED_SOURCE_DIRS) {
    const protectedPath = path.resolve(resolvedRepoRoot, relativeProtected)
    const canonicalProtectedPath = canonicalPath(protectedPath)
    if (
      isPathWithin(candidate, protectedPath)
      || isPathWithin(canonicalCandidate, canonicalProtectedPath)
    ) {
      throw new Error(`output directory must not be inside application source: ${relativeProtected}`)
    }
  }

  return canonicalCandidate
}

export function resolveOutputDirectory(rawValue, repoRoot = REPO_ROOT) {
  const value = rawValue === undefined || String(rawValue).trim() === ''
    ? 'db-backup/performance'
    : String(rawValue).trim()
  const candidate = path.isAbsolute(value)
    ? path.resolve(value)
    : path.resolve(repoRoot, value)

  assertOutputDirectoryContainment(candidate, repoRoot)
  return candidate
}

export function assertSafeOutputDirectory(outputDirectory, repoRoot = REPO_ROOT) {
  const candidate = path.resolve(outputDirectory)
  return assertOutputDirectoryContainment(candidate, repoRoot)
}

export function normalizeBaseUrl(rawValue) {
  let parsed
  try {
    parsed = new URL(rawValue)
  } catch {
    throw new Error('BASE_URL must be a valid http(s) URL')
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('BASE_URL must use http or https')
  }
  if (parsed.username || parsed.password) {
    throw new Error('BASE_URL must not contain credentials')
  }
  if (parsed.search || parsed.hash) {
    throw new Error('BASE_URL must not contain a query string or fragment')
  }

  const basePath = parsed.pathname.replace(/\/+$/, '')
  const baseUrl = `${parsed.origin}${basePath}`
  const port = Number(parsed.port || (parsed.protocol === 'https:' ? 443 : 80))
  const host = parsed.hostname.replace(/^\[|\]$/g, '')
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('BASE_URL port must be between 1 and 65535')
  }

  return {
    baseUrl,
    origin: parsed.origin,
    host,
    port,
    isLoopback: isLoopbackHost(host),
  }
}

export function isLoopbackHost(host) {
  const normalized = String(host).toLowerCase()
  if (normalized === 'localhost' || normalized === '::1') return true
  if (!/^127(?:\.\d{1,3}){3}$/.test(normalized)) return false
  return normalized.split('.').slice(1).every((part) => Number(part) <= 255)
}

export function buildRequestUrl(baseUrl, routePath) {
  if (!routePath.startsWith('/')) throw new Error('route path must start with /')
  return `${baseUrl}${routePath}`
}

export function collectCacheHeaders(headers) {
  const selected = {}
  for (const name of CACHE_HEADER_NAMES) {
    const value = headers.get(name)
    if (value !== null) selected[CACHE_HEADER_KEYS[name]] = value
  }
  return selected
}

export function summarizeLatency(values) {
  if (values.length === 0) {
    return { count: 0, min: null, p50: null, p95: null, max: null, mean: null }
  }

  const sorted = [...values].sort((left, right) => left - right)
  const percentile = (fraction) => sorted[Math.max(0, Math.ceil(fraction * sorted.length) - 1)]
  const round = (value) => Math.round(value * 1000) / 1000

  return {
    count: sorted.length,
    min: round(sorted[0]),
    p50: round(percentile(0.5)),
    p95: round(percentile(0.95)),
    max: round(sorted[sorted.length - 1]),
    mean: round(sorted.reduce((sum, value) => sum + value, 0) / sorted.length),
  }
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value)
}

function validateHealth(body) {
  if (!isRecord(body)) return 'health response must be a JSON object'
  if (body.status !== 'ok' || body.database !== 'reachable') {
    return 'health response is not an ok/reachable document'
  }
  return null
}

function validateSearch(body) {
  if (!isRecord(body)) return 'search response must be a JSON object'
  if (!Array.isArray(body.results)) return 'search response results must be an array'
  if (!isFiniteNumber(body.total) || body.total < 0) {
    return 'search response total must be a non-negative finite number'
  }
  return null
}

function validateHadith(body) {
  if (!isRecord(body) || !isRecord(body.hadith)) return 'hadith response must contain a hadith object'
  if (!Array.isArray(body.judgments) || !Array.isArray(body.isnad)) {
    return 'hadith judgments and isnad must be arrays'
  }
  return null
}

function validateNarrator(body) {
  if (!isRecord(body) || !isRecord(body.narrator)) return 'narrator response must contain a narrator object'
  if (!Array.isArray(body.books) || !Array.isArray(body.teachers) || !Array.isArray(body.students)) {
    return 'narrator books, teachers, and students must be arrays'
  }
  return null
}

export function validateTakhrij(body, options = {}) {
  if (!Array.isArray(body)) return 'takhrij response must be a JSON array'
  if (body.length === 0) {
    return options.allowEmpty
      ? null
      : 'takhrij response must contain at least one witness row for the representative fixture'
  }

  const requestedGroupId = options.groupId ?? null
  const expectedHadithId = options.hadithId ?? null
  for (const [index, row] of body.entries()) {
    if (!isRecord(row)) return `takhrij response row ${index} must be an object`
    if (!Number.isSafeInteger(row.main_id) || row.main_id <= 0) {
      return `takhrij response row ${index}.main_id must be a positive integer`
    }
    if (expectedHadithId !== null && row.main_id === expectedHadithId) {
      return `takhrij response row ${index}.main_id must be a different witness hadith`
    }
    if (!Number.isSafeInteger(row.book_id) || row.book_id <= 0) {
      return `takhrij response row ${index}.book_id must be a positive integer`
    }
    for (const key of ['book_name', 'book_title']) {
      if (typeof row[key] !== 'string' || row[key].trim().length === 0) {
        return `takhrij response row ${index}.${key} must be a non-empty string`
      }
    }
    if (row.book_name !== row.book_title) {
      return `takhrij response row ${index}.book_name and book_title must match the route contract`
    }
    for (const key of ['tarf', 'part_num', 'page_num']) {
      if (!Object.hasOwn(row, key)) {
        return `takhrij response row ${index} must contain ${key}`
      }
    }
    if (row.tarf !== null && typeof row.tarf !== 'string') {
      return `takhrij response row ${index}.tarf must be a string or null`
    }
    for (const key of ['part_num', 'page_num']) {
      if (row[key] !== null && !Number.isFinite(row[key])) {
        return `takhrij response row ${index}.${key} must be a finite number or null`
      }
    }
    if (row.hadith_id !== undefined) {
      if (!Number.isSafeInteger(row.hadith_id) || row.hadith_id <= 0) {
        return `takhrij response row ${index}.hadith_id must be a positive integer`
      }
      if (expectedHadithId !== null && row.hadith_id === expectedHadithId) {
        return `takhrij response row ${index}.hadith_id must be a different witness hadith`
      }
    }
    if (requestedGroupId !== null && Object.hasOwn(row, 'group_id') && row.group_id !== requestedGroupId) {
      return `takhrij response row ${index}.group_id must match requested group ${requestedGroupId}`
    }
  }

  return null
}

function validateTopic(body) {
  if (!isRecord(body) || !isRecord(body.item)) return 'topic response must contain an item object'
  if (!Array.isArray(body.hadiths) || !Array.isArray(body.children)) {
    return 'topic hadiths and children must be arrays'
  }
  if (body.mode !== 'children' && body.mode !== 'hadiths') {
    return 'topic response mode is missing or invalid'
  }
  return null
}

function validateTakhrijSpreadHtml(body) {
  if (!body.includes('الأحاديث المنتشرة عبر الكتب')) {
    return 'takhrij-spread HTML is missing its representative page marker'
  }
  return null
}

function validateServicesIndexHtml(body) {
  if (!body.includes('hadith_services')) {
    return 'service-index HTML is missing its representative page marker'
  }
  return null
}

export function withQuery(routePath, values) {
  const params = new URLSearchParams()
  for (const [name, value] of Object.entries(values)) params.set(name, String(value))
  return `${routePath}?${params.toString()}`
}

export function buildRoutes(fixtureIds) {
  const spreadValues = { minBooks: 3, page: 1 }
  if (fixtureIds.takhrijGroupId !== null) spreadValues.id = fixtureIds.takhrijGroupId

  return [
    {
      name: 'health',
      path: '/api/health',
      expectedFormat: 'json',
      validate: validateHealth,
    },
    {
      name: 'search',
      path: withQuery('/api/search', { q: 'الصلاة', page: 1, limit: 1 }),
      expectedFormat: 'json',
      validate: validateSearch,
    },
    {
      name: 'hadith',
      path: `/api/hadith/${fixtureIds.hadithId}`,
      expectedFormat: 'json',
      validate: validateHadith,
    },
    {
      name: 'narrator',
      path: `/api/narrator/${fixtureIds.narratorId}`,
      expectedFormat: 'json',
      validate: validateNarrator,
    },
    {
      name: 'takhrij',
      path: `/api/hadith/${fixtureIds.takhrijHadithId}/takhrij`,
      expectedFormat: 'json',
      validate: (body) => validateTakhrij(body, {
        hadithId: fixtureIds.takhrijHadithId,
        groupId: fixtureIds.takhrijGroupId,
        allowEmpty: fixtureIds.takhrijAllowEmpty,
      }),
    },
    {
      name: 'takhrij_spread',
      path: withQuery('/hadiths/takhrij-spread', spreadValues),
      expectedFormat: 'html',
      validate: validateTakhrijSpreadHtml,
    },
    {
      name: 'service_index',
      path: '/hadiths/services-index',
      expectedFormat: 'html',
      validate: validateServicesIndexHtml,
    },
    {
      name: 'topic',
      path: withQuery(`/api/topics/item/${fixtureIds.topicId}`, { view: 'hadiths', page: 1 }),
      expectedFormat: 'json',
      validate: validateTopic,
    },
  ]
}

function normalizeContentType(contentType) {
  return (contentType || '').split(';', 1)[0].trim().toLowerCase()
}

export function hasExpectedContentType(contentType, expectedFormat) {
  const normalized = normalizeContentType(contentType)
  if (expectedFormat === 'json') {
    return normalized === 'application/json' || normalized.endsWith('+json')
  }
  return normalized === 'text/html' || normalized === 'application/xhtml+xml'
}

export function validateBody(bodyText, expectedFormat, validator) {
  if (expectedFormat === 'json') {
    let parsed
    try {
      parsed = JSON.parse(bodyText)
    } catch {
      return 'response body is not valid JSON'
    }
    return validator(parsed)
  }
  if (!bodyText.trim()) return 'HTML response body is empty'
  return validator(bodyText)
}

function roundMilliseconds(value) {
  return Math.round(value * 1000) / 1000
}

export function isTimeoutError(error) {
  return Boolean(error && typeof error === 'object' && error.name === 'TimeoutError')
}

export async function readDecodedBody(response, maxBytes = MAX_RESPONSE_BYTES) {
  if (!response.body) {
    return { bodyText: '', decodedBytes: 0, bodyComplete: true }
  }

  const reader = response.body.getReader()
  const chunks = []
  let decodedBytes = 0
  let bodyComplete = true

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    const chunk = Buffer.from(value)
    decodedBytes += chunk.byteLength
    if (decodedBytes > maxBytes) {
      bodyComplete = false
      await reader.cancel().catch(() => undefined)
      break
    }
    chunks.push(chunk)
  }

  return {
    bodyText: bodyComplete ? Buffer.concat(chunks, decodedBytes).toString('utf8') : '',
    decodedBytes,
    bodyComplete,
  }
}

function errorSample(base, kind, message) {
  return {
    ...base,
    latency_ms: null,
    outcome: 'error',
    error: { kind, message },
  }
}

export async function measureSample(route, target, timeoutMs, fetchImpl = fetch, options = {}) {
  const requestUrl = buildRequestUrl(target.baseUrl, route.path)
  const startedAt = performance.now()
  let response

  try {
    response = await fetchImpl(requestUrl, {
      method: 'GET',
      redirect: 'manual',
      headers: {
        accept: route.expectedFormat === 'json' ? 'application/json' : 'text/html',
        'user-agent': 'HadithSafePerformanceBaseline/1.0',
      },
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (error) {
    const totalDuration = roundMilliseconds(performance.now() - startedAt)
    const kind = isTimeoutError(error) ? 'timeout' : 'network_error'
    const message = kind === 'timeout'
      ? `request exceeded the ${timeoutMs}ms timeout`
      : 'request failed before response headers were received'
    return errorSample(
      {
        status: null,
        total_duration_ms: totalDuration,
        ttfb_ms: null,
        decoded_bytes: 0,
        decoded_bytes_complete: false,
        cache_headers: {},
        content_type: null,
        content_encoding: null,
      },
      kind,
      message,
    )
  }

  const ttfb = roundMilliseconds(performance.now() - startedAt)
  const sampleBase = {
    status: response.status,
    total_duration_ms: null,
    ttfb_ms: ttfb,
    decoded_bytes: 0,
    decoded_bytes_complete: true,
    cache_headers: collectCacheHeaders(response.headers),
    content_type: response.headers.get('content-type'),
    content_encoding: response.headers.get('content-encoding'),
  }

  let body
  try {
    body = await readDecodedBody(response, options.maxResponseBytes ?? MAX_RESPONSE_BYTES)
  } catch (error) {
    const totalDuration = roundMilliseconds(performance.now() - startedAt)
    const kind = isTimeoutError(error) ? 'timeout' : 'response_read_error'
    const message = kind === 'timeout'
      ? `response did not finish before the ${timeoutMs}ms timeout`
      : 'response stream failed before the body was decoded'
    return errorSample(
      { ...sampleBase, total_duration_ms: totalDuration },
      kind,
      message,
    )
  }

  const totalDuration = roundMilliseconds(performance.now() - startedAt)
  sampleBase.total_duration_ms = totalDuration
  sampleBase.decoded_bytes = body.decodedBytes
  sampleBase.decoded_bytes_complete = body.bodyComplete

  if (!body.bodyComplete) {
    return errorSample(
      sampleBase,
      'body_limit',
      `decoded response exceeded the ${options.maxResponseBytes ?? MAX_RESPONSE_BYTES}-byte safety cap`,
    )
  }
  if (response.status >= 500) {
    return errorSample(sampleBase, 'http_5xx', `server returned HTTP ${response.status}`)
  }
  if (response.status < 200 || response.status >= 300) {
    return errorSample(sampleBase, 'http_status', `request returned HTTP ${response.status}`)
  }
  if (!hasExpectedContentType(response.headers.get('content-type'), route.expectedFormat)) {
    return errorSample(
      sampleBase,
      'malformed_content_type',
      `expected ${route.expectedFormat} content type`,
    )
  }

  const validationError = validateBody(body.bodyText, route.expectedFormat, route.validate)
  if (validationError) {
    return errorSample(sampleBase, 'malformed_response', validationError)
  }

  return {
    ...sampleBase,
    latency_ms: totalDuration,
    outcome: 'success',
  }
}

function summarizeRoute(samples, requestedSamples, stopReason) {
  const successful = samples.filter((sample) => sample.outcome === 'success')
  const errors = samples.filter((sample) => sample.outcome === 'error')
  const statusCounts = {}
  const errorCounts = {}

  for (const sample of samples) {
    const statusKey = sample.status === null ? 'none' : String(sample.status)
    statusCounts[statusKey] = (statusCounts[statusKey] || 0) + 1
    if (sample.error) {
      errorCounts[sample.error.kind] = (errorCounts[sample.error.kind] || 0) + 1
    }
  }

  return {
    requested_samples: requestedSamples,
    completed_samples: samples.length,
    skipped_samples: Math.max(0, requestedSamples - samples.length),
    successful_samples: successful.length,
    error_samples: errors.length,
    status_counts: statusCounts,
    error_counts: errorCounts,
    successful_latency_ms: summarizeLatency(successful.map((sample) => sample.latency_ms)),
    successful_ttfb_ms: summarizeLatency(successful.map((sample) => sample.ttfb_ms)),
    successful_decoded_bytes: summarizeLatency(successful.map((sample) => sample.decoded_bytes)),
    stopped_early: Boolean(stopReason),
    stop_reason: stopReason,
    passed: errors.length === 0 && samples.length === requestedSamples,
  }
}

function summarizeProgress(sample, sampleNumber, sampleCount, jsonMode) {
  if (jsonMode) return
  if (sample.outcome === 'success') {
    console.log(
      `PASS ${sample.status} ${roundMilliseconds(sample.total_duration_ms)}ms `
      + `route=${sample.route} sample=${sampleNumber}/${sampleCount}`,
    )
  } else {
    const status = sample.status === null ? '---' : sample.status
    console.error(
      `FAIL ${status} ${roundMilliseconds(sample.total_duration_ms)}ms `
      + `route=${sample.route} sample=${sampleNumber}/${sampleCount} `
      + `error=${sample.error.kind}: ${sample.error.message}`,
    )
  }
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

function probeTcp(target, timeoutMs) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: target.host, port: target.port })
    let settled = false
    const finish = (reachable) => {
      if (settled) return
      settled = true
      socket.destroy()
      resolve(reachable)
    }

    socket.setTimeout(timeoutMs, () => finish(false))
    socket.once('connect', () => finish(true))
    socket.once('error', () => finish(false))
  })
}

function relativeReportPath(reportPath) {
  const relative = path.relative(REPO_ROOT, reportPath)
  return isPathWithin(reportPath, REPO_ROOT)
    ? relative
    : reportPath
}

export function createReportPath(outputDirectory) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const nonce = randomBytes(4).toString('hex')
  return path.join(outputDirectory, `route-baseline-${timestamp}-${nonce}.json`)
}

export async function writeReport(
  report,
  outputDirectory,
  repoRoot = REPO_ROOT,
  reportPathFactory = createReportPath,
) {
  assertSafeOutputDirectory(outputDirectory, repoRoot)
  await mkdir(outputDirectory, { recursive: true })
  assertSafeOutputDirectory(outputDirectory, repoRoot)
  const reportPath = reportPathFactory(outputDirectory)
  report.output.file = relativeReportPath(reportPath)
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
  })
  return reportPath
}

function aggregateReportSummary(routes) {
  const allSamples = routes.flatMap((route) => route.samples)
  const successful = allSamples.filter((sample) => sample.outcome === 'success')
  const requested = routes.reduce((sum, route) => sum + route.summary.requested_samples, 0)

  return {
    requested_samples: requested,
    completed_samples: allSamples.length,
    skipped_samples: routes.reduce((sum, route) => sum + route.summary.skipped_samples, 0),
    successful_samples: successful.length,
    error_samples: allSamples.filter((sample) => sample.outcome === 'error').length,
    successful_latency_ms: summarizeLatency(successful.map((sample) => sample.latency_ms)),
    successful_ttfb_ms: summarizeLatency(successful.map((sample) => sample.ttfb_ms)),
  }
}

function buildConfig(args) {
  const rawBaseUrl = args.baseUrl ?? process.env.BASE_URL ?? DEFAULT_BASE_URL
  const target = normalizeBaseUrl(rawBaseUrl)
  const samples = parseBoundedInteger(
    args.samples ?? process.env.PERF_SAMPLES ?? process.env.PERF_SAMPLE_COUNT,
    DEFAULT_SAMPLES,
    1,
    MAX_SAMPLES,
    'PERF_SAMPLES',
  )
  const timeoutMs = parseBoundedInteger(
    args.timeoutMs ?? process.env.PERF_TIMEOUT_MS ?? process.env.PERF_TIMEOUT,
    DEFAULT_TIMEOUT_MS,
    MIN_TIMEOUT_MS,
    MAX_TIMEOUT_MS,
    'PERF_TIMEOUT_MS',
  )
  const outputDirectory = resolveOutputDirectory(
    args.outputDir ?? process.env.PERF_OUTPUT_DIR,
  )
  const json = args.json || /^(1|true|yes)$/i.test(process.env.PERF_JSON || '')

  const hadithId = parseFixtureId('PERF_HADITH_ID', process.env.PERF_HADITH_ID, 5)
  const fixtureIds = {
    hadithId,
    takhrijHadithId: parseFixtureId(
      'PERF_TAKHRIJ_HADITH_ID',
      process.env.PERF_TAKHRIJ_HADITH_ID,
      hadithId,
    ),
    narratorId: parseFixtureId('PERF_NARRATOR_ID', process.env.PERF_NARRATOR_ID, 9),
    topicId: parseFixtureId('PERF_TOPIC_ID', process.env.PERF_TOPIC_ID, 759),
    takhrijGroupId: parseFixtureId(
      'PERF_TAKHRIJ_GROUP_ID',
      process.env.PERF_TAKHRIJ_GROUP_ID,
      null,
    ),
    takhrijAllowEmpty: /^(1|true|yes)$/i.test(process.env.PERF_TAKHRIJ_ALLOW_EMPTY || ''),
  }

  return {
    target,
    samples,
    timeoutMs,
    outputDirectory,
    json,
    fixtureIds,
  }
}

export async function runBaseline(config, options = {}) {
  const {
    measure = (route, target, timeoutMs) => measureSample(
      route,
      target,
      timeoutMs,
      options.fetchImpl ?? fetch,
      options,
    ),
    requestGapMs = REQUEST_GAP_MS,
  } = options
  const routesToRun = buildRoutes(config.fixtureIds)
  const routes = []
  let requestSequence = 0
  let consecutive5xx = 0
  let globalAbort = null

  for (const route of routesToRun) {
    if (globalAbort) break
    const samples = []
    let consecutiveRouteErrors = 0
    let routeStopReason = null

    for (let sampleNumber = 1; sampleNumber <= config.samples; sampleNumber += 1) {
      if (requestSequence > 0) await delay(requestGapMs)
      const measured = await measure(route, config.target, config.timeoutMs, config)
      requestSequence += 1
      const sample = { sample: sampleNumber, route: route.name, ...measured }
      samples.push(sample)
      summarizeProgress(sample, sampleNumber, config.samples, config.json)

      if (sample.outcome === 'error' && sample.status !== null && sample.status >= 500) {
        consecutive5xx += 1
      } else {
        consecutive5xx = 0
      }

      if (sample.outcome === 'error') {
        consecutiveRouteErrors += 1
        if (consecutive5xx >= REPEATED_5XX_LIMIT) {
          routeStopReason = `stopped after ${consecutive5xx} consecutive 5xx responses`
          globalAbort = {
            reason: 'repeated_5xx',
            route: route.name,
            sample: sampleNumber,
            status: sample.status,
          }
        } else if (consecutiveRouteErrors >= CONSECUTIVE_ERROR_LIMIT) {
          routeStopReason = `stopped after ${consecutiveRouteErrors} consecutive errors`
        }

        if (globalAbort || routeStopReason) break
      } else {
        consecutiveRouteErrors = 0
      }
    }

    routes.push({
      name: route.name,
      path: route.path,
      expected_format: route.expectedFormat,
      samples,
      summary: summarizeRoute(samples, config.samples, routeStopReason),
    })
  }

  const unfinishedRoutes = routesToRun.slice(routes.length).map((route) => ({
    name: route.name,
    path: route.path,
    expected_format: route.expectedFormat,
    samples: [],
    summary: {
      ...summarizeRoute([], config.samples, 'not run because the baseline aborted'),
      requested_samples: config.samples,
    },
  }))
  routes.push(...unfinishedRoutes)

  const summary = aggregateReportSummary(routes)
  return {
    schema_version: 1,
    kind: 'hadith-route-performance-baseline',
    verdict: summary.error_samples === 0 && summary.successful_samples === summary.requested_samples
      ? 'pass'
      : 'fail',
    started_at: new Date().toISOString(),
    target: {
      origin: config.target.origin,
      scope: config.target.isLoopback ? 'loopback' : 'remote',
    },
    config: {
      method: 'GET',
      sequential: true,
      follows_redirects: false,
      samples_per_route: config.samples,
      max_samples_per_route: MAX_SAMPLES,
      timeout_ms: config.timeoutMs,
      request_gap_ms: options.requestGapMs ?? REQUEST_GAP_MS,
      max_decoded_response_bytes: MAX_RESPONSE_BYTES,
      consecutive_error_route_limit: CONSECUTIVE_ERROR_LIMIT,
      repeated_5xx_limit: REPEATED_5XX_LIMIT,
      fixture_ids: config.fixtureIds,
    },
    routes,
    summary,
    aborted: globalAbort,
    output: {
      directory: relativeReportPath(config.outputDirectory),
      file: null,
    },
    limitations: [
      'Node fetch timing is client-observed; ttfb_ms is measured when response headers become available.',
      'decoded_bytes are the decompressed body bytes observed by Node fetch, not wire-transfer bytes.',
      'Only validated 2xx responses contribute to successful latency and TTFB statistics.',
      'This bounded sequential baseline is not a concurrency, capacity, or production load test.',
    ],
  }
}

function printSkip(config) {
  const message = `SKIP target ${config.target.origin} is not listening; no HTTP requests were sent.`
  const prerequisite = config.target.isLoopback
    ? 'Start the local app first (for example: npm run dev), then rerun this command.'
    : 'Verify BASE_URL, network reachability, and server availability, then rerun this command.'

  if (config.json) {
    console.log(JSON.stringify({
      kind: 'hadith-route-performance-baseline-skip',
      verdict: 'skip',
      target: { origin: config.target.origin, scope: config.target.isLoopback ? 'loopback' : 'remote' },
      reason: message,
      prerequisite,
    }, null, 2))
  } else {
    console.error(message)
    console.error(prerequisite)
  }

  if (!config.target.isLoopback) process.exitCode = 2
}

async function main() {
  let args
  let config
  try {
    args = parseArgs(process.argv.slice(2))
    if (args.help) {
      printHelp()
      return
    }
    config = buildConfig(args)
  } catch (error) {
    console.error(`ERROR ${error instanceof Error ? error.message : String(error)}`)
    console.error('Run with --help for usage and safety limits.')
    process.exitCode = 1
    return
  }

  const reachable = await probeTcp(config.target, Math.min(PROBE_TIMEOUT_MS, config.timeoutMs))
  if (!reachable) {
    printSkip(config)
    return
  }

  const startedAt = performance.now()
  const runStartedAt = new Date().toISOString()
  let report
  try {
    report = await runBaseline(config)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unexpected baseline failure'
    console.error(`ERROR baseline failed before a report could be completed: ${message}`)
    if (config.json) {
      console.log(JSON.stringify({
        kind: 'hadith-route-performance-baseline-error',
        verdict: 'error',
        target: { origin: config.target.origin, scope: config.target.isLoopback ? 'loopback' : 'remote' },
        error: { kind: 'runner_failure', message },
      }, null, 2))
    }
    process.exitCode = 1
    return
  }
  report.started_at = runStartedAt
  report.duration_ms = roundMilliseconds(performance.now() - startedAt)
  report.finished_at = new Date().toISOString()

  let reportWriteError = null
  try {
    await writeReport(report, config.outputDirectory)
  } catch (error) {
    reportWriteError = {
      kind: 'report_write_error',
      code: error && typeof error === 'object' && 'code' in error ? String(error.code) : 'unknown',
    }
    report.output.write_error = reportWriteError
    report.verdict = 'fail'
  }

  if (config.json) {
    console.log(JSON.stringify(report, null, 2))
  } else {
    if (report.verdict === 'pass') {
      console.log(`PASS baseline: ${report.summary.successful_samples}/${report.summary.requested_samples} validated samples.`)
    } else {
      console.error(`FAIL baseline: ${report.summary.error_samples} error sample(s); ${report.summary.successful_samples}/${report.summary.requested_samples} validated.`)
    }
    if (report.aborted?.reason === 'repeated_5xx') {
      console.error(`ABORT repeated 5xx at ${report.aborted.route} sample ${report.aborted.sample} (HTTP ${report.aborted.status}).`)
    }
    if (reportWriteError) {
      console.error(`ERROR could not exclusively create report file (${reportWriteError.code}).`)
    } else {
      console.log(`Report: ${report.output.file}`)
    }
  }

  if (report.verdict !== 'pass') process.exitCode = 1
}

const isMainModule = process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url

if (isMainModule) await main()
