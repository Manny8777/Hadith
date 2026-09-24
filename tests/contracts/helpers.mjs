import assert from 'node:assert/strict'
import { contractFixtures } from './fixtures.mjs'

const DEFAULT_TIMEOUT_MS = contractFixtures.timeoutMs

export function getBaseUrl() {
  const raw = process.env.BASE_URL?.trim()
  if (!raw) return null
  try {
    const url = new URL(raw)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.toString().replace(/\/+$/, '')
  } catch {
    return null
  }
}

export function invalidBaseUrlMessage() {
  return 'Skipped: BASE_URL must be an absolute http(s) URL when supplied.'
}

export function skipMessage() {
  return 'Skipped: set BASE_URL to a reachable test server (for example, http://127.0.0.1:3000).'
}

export function isMissingServerError(error) {
  if (!(error instanceof Error)) return false
  if (error.name === 'AbortError' || error.name === 'TimeoutError') return false

  const missingServerCodes = new Set([
    'ECONNREFUSED',
    'ENOTFOUND',
    'EAI_AGAIN',
    'ECONNRESET',
    'EPIPE',
    'ERR_SOCKET_CONNECTION_TIMEOUT',
  ])
  const seen = new Set()
  const pending = [error]
  while (pending.length > 0) {
    const current = pending.pop()
    if (typeof current !== 'object' || current === null || seen.has(current)) continue
    seen.add(current)
    if ('code' in current) {
      const code = String(current.code)
      if (missingServerCodes.has(code)) return true
    }
    if ('cause' in current) pending.push(current.cause)
    if (Array.isArray(current.errors)) pending.push(...current.errors)
  }
  return false
}

export async function requestJson(baseUrl, path, options = {}) {
  const url = `${baseUrl}${path}`
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  let response
  try {
    response = await fetch(url, {
      headers: { accept: 'application/json', ...(options.headers ?? {}) },
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (error) {
    if (error && typeof error === 'object') error.url = url
    throw error
  }

  const text = await response.text()
  let body
  try {
    body = text === '' ? undefined : JSON.parse(text)
  } catch (error) {
    if (error && typeof error === 'object') {
      error.url = url
      error.status = response.status
      error.body = text.slice(0, 500)
    }
    throw new Error(`Malformed JSON from ${url} (HTTP ${response.status}): ${error.message}`, { cause: error })
  }

  if (response.status >= 500) {
    throw new Error(`HTTP ${response.status} from ${url}: ${text.slice(0, 500)}`)
  }
  const contentType = response.headers.get('content-type') || ''
  if (!contentType.toLowerCase().includes('application/json')) {
    throw new Error(`Expected application/json from ${url}; received content-type=${contentType || 'missing'}`)
  }
  return { response, body }
}

export function assertJsonObject(value, label = 'response') {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), `${label} must be a JSON object`)
  return value
}

export function assertKeys(value, keys, label = 'response') {
  assertJsonObject(value, label)
  for (const key of keys) {
    assert.ok(Object.hasOwn(value, key), `${label}.${key} is required`)
  }
  return value
}

export function assertInteger(value, label, { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER, nullable = false } = {}) {
  if (value === null && nullable) return value
  assert.ok(Number.isSafeInteger(value), `${label} must be a safe integer`)
  assert.ok(value >= min, `${label} must be >= ${min}`)
  assert.ok(value <= max, `${label} must be <= ${max}`)
  return value
}

export function assertNonNegativeInteger(value, label) {
  return assertInteger(value, label, { min: 0 })
}

/** PostgreSQL COUNT(bigint) is commonly serialized by node-postgres as a digit string. */
export function assertNonNegativeCount(value, label) {
  if (typeof value === 'number') return assertNonNegativeInteger(value, label)
  assert.equal(typeof value, 'string', `${label} must be a non-negative integer or digit string`)
  assert.match(value, /^\d+$/, `${label} must be a non-negative integer or digit string`)
  assert.ok(Number.isSafeInteger(Number(value)), `${label} must fit in a safe integer`)
  return value
}

/** PostgreSQL BIGINT IDs are sometimes serialized as digit strings by node-postgres. */
export function assertNumericId(value, label, { min = 0, nullable = false, allowString = false } = {}) {
  if (value === null && nullable) return value
  if (typeof value === 'number') return assertInteger(value, label, { min })
  if (allowString) {
    assert.equal(typeof value, 'string', `${label} must be a numeric ID or digit string`)
    assert.match(value, /^\d+$/, `${label} must be a numeric ID or digit string`)
    assert.ok(Number.isSafeInteger(Number(value)), `${label} must fit in a safe integer`)
    assert.ok(Number(value) >= min, `${label} must be >= ${min}`)
    return value
  }
  assert.equal(typeof value, 'number', `${label} must be a number`)
  return assertInteger(value, label, { min })
}

export function assertArray(value, label) {
  assert.ok(Array.isArray(value), `${label} must be an array`)
  return value
}

export function assertOptionalString(value, label) {
  assert.ok(value === null || value === undefined || typeof value === 'string', `${label} must be a string or null`)
  return value
}

export function hasArabic(value) {
  return typeof value === 'string' && /\p{Script=Arabic}/u.test(value)
}

export function assertArabicName(value, label, { nullable = false } = {}) {
  if (value === null || value === undefined) {
    assert.ok(nullable, `${label} must not be null when its source record exists`)
    return value
  }
  assert.ok(typeof value === 'string' && value.trim().length > 0, `${label} must be a non-empty string`)
  assert.ok(hasArabic(value), `${label} should contain Arabic text`)
  return value
}
