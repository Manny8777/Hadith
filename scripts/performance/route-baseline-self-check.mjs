#!/usr/bin/env node

import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  buildRequestUrl,
  collectCacheHeaders,
  isLoopbackHost,
  normalizeBaseUrl,
  parseBoundedInteger,
  parseFixtureId,
  resolveOutputDirectory,
  summarizeLatency,
} from './route-baseline.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

assert.equal(parseBoundedInteger(undefined, 3, 1, 10, 'SAMPLES'), 3)
assert.equal(parseBoundedInteger('1', 3, 1, 10, 'SAMPLES'), 1)
assert.throws(() => parseBoundedInteger('0', 3, 1, 10, 'SAMPLES'), /integer from 1 to 10/)
assert.throws(() => parseBoundedInteger('11', 3, 1, 10, 'SAMPLES'), /integer from 1 to 10/)
assert.throws(() => parseBoundedInteger('2.5', 3, 1, 10, 'SAMPLES'), /integer from 1 to 10/)

assert.equal(parseFixtureId('ID', undefined, 5), 5)
assert.equal(parseFixtureId('ID', '759', 5), 759)
assert.throws(() => parseFixtureId('ID', '../../secret', 5), /positive database integer/)
assert.throws(() => parseFixtureId('ID', '2147483648', 5), /positive database integer/)

assert.equal(
  resolveOutputDirectory(undefined, root),
  path.join(root, 'db-backup', 'performance'),
)
assert.throws(() => resolveOutputDirectory('app/performance', root), /ignored db-backup/)
assert.throws(() => resolveOutputDirectory('local-performance-baseline', root), /ignored db-backup/)
assert.throws(() => resolveOutputDirectory('.', root), /repository root/)
assert.equal(
  resolveOutputDirectory(path.join(root, '..', 'local-performance-baseline'), root),
  path.resolve(root, '..', 'local-performance-baseline'),
)

const target = normalizeBaseUrl('http://127.0.0.1:3000/')
assert.equal(target.origin, 'http://127.0.0.1:3000')
assert.equal(target.port, 3000)
assert.equal(target.isLoopback, true)
assert.equal(buildRequestUrl(target.baseUrl, '/api/health'), 'http://127.0.0.1:3000/api/health')
assert.throws(() => normalizeBaseUrl('https://user:secret@example.test'), /credentials/)
assert.throws(() => normalizeBaseUrl('https://example.test?token=secret'), /query string or fragment/)
assert.equal(isLoopbackHost('localhost'), true)
assert.equal(isLoopbackHost('127.0.0.5'), true)
assert.equal(isLoopbackHost('127.999.0.1'), false)
assert.equal(isLoopbackHost('example.test'), false)

const headers = collectCacheHeaders(new Headers({
  age: '12',
  'cache-control': 'private, max-age=0',
  etag: '"fixture-etag"',
  'set-cookie': 'must-not-be-collected=secret',
  'x-nextjs-cache': 'MISS',
}))
assert.equal(headers.cache_control, 'private, max-age=0')
assert.equal(headers.x_nextjs_cache, 'MISS')
assert.equal(Object.hasOwn(headers, 'set_cookie'), false)
assert.equal(JSON.stringify(headers).includes('must-not-be-collected'), false)

assert.deepEqual(
  summarizeLatency([]),
  { count: 0, min: null, p50: null, p95: null, max: null, mean: null },
)
assert.deepEqual(
  summarizeLatency([10, 20, 30]),
  { count: 3, min: 10, p50: 20, p95: 30, max: 30, mean: 20 },
)

console.log('Route baseline self-checks passed.')
