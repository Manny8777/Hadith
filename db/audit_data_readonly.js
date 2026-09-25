#!/usr/bin/env node
'use strict'

// Phase-1 data audit: mapping-aware, bounded, and strictly read-only.
//
// This runner never creates a temporary table and never runs DDL/DML. All database reads happen in
// BEGIN READ ONLY. The database URL is resolved only by db/dbenv.js and is never included in a
// report, log line, or error message.
//
// Usage:
//   node db/audit_data_readonly.js [--output-dir <path>] [--manifest <path>]
//     [--source-evidence <path>] [--statement-timeout-ms <1000..600000>]
//     [--work-mem-mb <1..128>]

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { execFileSync, spawnSync } = require('child_process')
const { Client } = require('pg')
const dbenv = require('./dbenv')

const ROOT = path.join(__dirname, '..')
const DEFAULT_MANIFEST = path.join(__dirname, 'audit_manifest.json')
const DEFAULT_TIMEOUT_MS = 120_000
const DEFAULT_WORK_MEM_MB = 32
const MAX_WORK_MEM_MB = 128
const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024
const REPORT_VERSION = 1

const SERVER_METADATA_QUERY = `
SELECT
  current_database()::text AS database_name,
  current_user::text AS database_user,
  current_setting('server_version')::text AS server_version,
  current_setting('server_version_num')::text AS server_version_num,
  pg_is_in_recovery()::boolean AS in_recovery,
  pg_postmaster_start_time()::timestamptz AS server_started_at,
  current_setting('transaction_read_only')::text AS transaction_read_only,
  current_setting('statement_timeout')::text AS statement_timeout,
  current_setting('work_mem')::text AS work_mem,
  current_setting('max_parallel_workers_per_gather')::text AS max_parallel_workers_per_gather,
  current_setting('lock_timeout')::text AS lock_timeout,
  current_setting('idle_in_transaction_session_timeout')::text AS idle_in_transaction_session_timeout
`

const FORBIDDEN_SQL = /\b(?:INSERT|UPDATE|DELETE|MERGE|TRUNCATE|ALTER|CREATE|DROP|GRANT|REVOKE|VACUUM|ANALYZE|CALL|DO|COPY|LOCK|REFRESH|COMMENT|SECURITY|NOTIFY|LISTEN|UNLISTEN|DISCARD|RESET|INTO)\b/i
const FORBIDDEN_EXPLAIN = /\bEXPLAIN\b|\bSTRING_AGG\b/i
const SAFE_IDENTIFIER = /^[a-z][a-z0-9_]*$/
const AUDIT_OUTPUT_ROOT = path.join(ROOT, 'db-backup')
const REPORT_FILENAMES = ['data-audit.json', 'data-audit.md']

const COMPLETED_ASSESSMENT_CONTRACTS = {
  service_types: {
    requiredEvidence: [
      ['rawRows', (evidence) => evidence.rawRows],
      ['distinctKeys', (evidence) => evidence.distinctKeys],
      ['missingValidKeys', (evidence) => evidence.missingValidKeys],
      ['extraWebKeys', (evidence) => evidence.extraWebKeys],
      ['expectedWebRawRows', (evidence) => evidence.expectedWebRawRows],
      ['expectedType15LinkRows', (evidence) => evidence.expectedType15LinkRows],
    ],
    requiredMapping: [
      ['expectedWeb.rawRows', (mapping) => mapping.expectedWeb?.rawRows],
      ['expectedWeb.distinctKeys', (mapping) => mapping.expectedWeb?.distinctKeys],
      ['expectedWeb.type15LinkRows', (mapping) => mapping.expectedWeb?.type15LinkRows],
      ['expectedWeb.ids', (mapping) => mapping.expectedWeb?.ids],
      ['expectedWeb.columnKeys', (mapping) => mapping.expectedWeb?.columnKeys],
    ],
    webChecks: [
      ['raw_rows', (evidence) => evidence.expectedWebRawRows],
      ['distinct_keys', (evidence, mapping) => mapping.expectedWeb?.distinctKeys],
      ['duplicate_rows', () => 0],
      ['type_15_link_rows', (evidence) => evidence.expectedType15LinkRows],
    ],
    booleanChecks: [['exact_expected_lookup', true]],
  },
  narrator_relations: {
    requiredEvidence: [
      ['rawRows', (evidence) => evidence.rawRows],
      ['distinctKeys', (evidence) => evidence.distinctKeys],
      ['duplicateRows', (evidence) => evidence.duplicateRows],
      ['missingValidKeys', (evidence) => evidence.missingValidKeys],
      ['extraWebKeys', (evidence) => evidence.extraWebKeys],
      ['legacySentinelRawRows', (evidence) => evidence.legacySentinelRawRows],
      ['expectedWebRawRows', (evidence) => evidence.expectedWebRawRows],
      ['expectedPolymorphicSecondIds', (evidence) => evidence.expectedPolymorphicSecondIds],
    ],
    webChecks: [
      ['raw_rows', (evidence) => evidence.expectedWebRawRows],
      ['distinct_keys', (evidence) => evidence.distinctKeys],
      ['duplicate_rows', () => 0],
      ['other_nonpositive_sentinels', () => 0],
      ['unresolved_positive_first_ids', () => 0],
      ['unresolved_positive_second_ids', (evidence) => evidence.expectedPolymorphicSecondIds],
    ],
    observedWebChecks: [['second_id_zero_sentinels']],
  },
  takhrij_memberships: {
    requiredEvidence: [
      ['rawRows', (evidence) => evidence.rawRows],
      ['distinctKeys', (evidence) => evidence.distinctKeys],
      ['duplicateRows', (evidence) => evidence.duplicateRows],
      ['missingValidKeys', (evidence) => evidence.missingValidKeys],
      ['extraWebKeys', (evidence) => evidence.extraWebKeys],
      ['expectedWebRawRows', (evidence) => evidence.expectedWebRawRows],
    ],
    webChecks: [
      ['raw_rows', (evidence) => evidence.expectedWebRawRows],
      ['distinct_keys', (evidence) => evidence.distinctKeys],
      ['duplicate_rows', () => 0],
      ['nonpositive_hadith_or_group_sentinels', () => 0],
      ['unresolved_hadith_ids', () => 0],
    ],
  },
  matn_hadith_comparisons: {
    requiredEvidence: [
      ['rawRows', (evidence) => evidence.rawRows],
      ['distinctKeys', (evidence) => evidence.distinctKeys],
      ['duplicateRows', (evidence) => evidence.duplicateRows],
      ['validDistinctKeys', (evidence) => evidence.validDistinctKeys],
      ['missingValidKeys', (evidence) => evidence.missingValidKeys],
      ['extraWebKeys', (evidence) => evidence.extraWebKeys],
      ['expectedWebRawRows', (evidence) => evidence.expectedWebRawRows],
      ['expectedInvalidWebRows', (evidence) => evidence.expectedInvalidWebRows],
    ],
    webChecks: [
      ['raw_rows', (evidence) => evidence.expectedWebRawRows],
      ['distinct_keys', (evidence) => evidence.validDistinctKeys],
      ['duplicate_rows', () => 0],
      ['nonpositive_rows', (evidence) => evidence.expectedInvalidWebRows],
      ['out_of_range_rows', (evidence) => evidence.expectedInvalidWebRows],
      ['unresolved_hadith_ids', () => 0],
    ],
  },
}

function usage() {
  return [
    'Usage: node db/audit_data_readonly.js [options]',
    '',
    'Options:',
    '  --output-dir <path>             Report directory under ignored db-backup/ (default: db-backup/audits/<timestamp>)',
    '  --manifest <path>               Mapping manifest (default: db/audit_manifest.json)',
    '  --source-evidence <path>        Optional legacy source-evidence/fingerprint JSON',
    '  --statement-timeout-ms <value>  Per-statement timeout, 1000..600000 (default: 120000)',
    '  --work-mem-mb <value>            Bounded local work_mem, 1..128 (default: 32)',
    '  --help                          Show this help',
  ].join('\n')
}

function parseIntegerOption(raw, name, min, max) {
  const value = Number(raw)
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer from ${min} to ${max}`)
  }
  return value
}

function parseArgs(argv) {
  const options = {
    outputDir: null,
    manifest: DEFAULT_MANIFEST,
    sourceEvidence: null,
    statementTimeoutMs: DEFAULT_TIMEOUT_MS,
    workMemMb: DEFAULT_WORK_MEM_MB,
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--help' || arg === '-h') {
      options.help = true
    } else if (arg === '--output-dir') {
      options.outputDir = requiredArgument(argv, ++i, arg)
    } else if (arg === '--out-dir') {
      options.outputDir = requiredArgument(argv, ++i, arg)
    } else if (arg === '--manifest') {
      options.manifest = requiredArgument(argv, ++i, arg)
    } else if (arg === '--source-evidence') {
      options.sourceEvidence = requiredArgument(argv, ++i, arg)
    } else if (arg === '--statement-timeout-ms') {
      options.statementTimeoutMs = parseIntegerOption(
        requiredArgument(argv, ++i, arg), '--statement-timeout-ms', 1000, 600_000,
      )
    } else if (arg === '--work-mem-mb') {
      options.workMemMb = parseIntegerOption(
        requiredArgument(argv, ++i, arg), '--work-mem-mb', 1, MAX_WORK_MEM_MB,
      )
    } else {
      throw new Error(`unknown option: ${arg}`)
    }
  }
  return options
}

function requiredArgument(argv, index, option) {
  const value = argv[index]
  if (!value || value.startsWith('--')) throw new Error(`${option} requires a value`)
  return value
}

function resolveFromRoot(value) {
  return path.isAbsolute(value) ? value : path.resolve(ROOT, value)
}

function displayPath(file) {
  const relative = path.relative(ROOT, file)
  if (!relative.startsWith('..') && !path.isAbsolute(relative)) return relative.replace(/\\/g, '/')
  return file
}

function sha256Buffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

function sha256File(file) {
  const hash = crypto.createHash('sha256')
  const descriptor = fs.openSync(file, 'r')
  const buffer = Buffer.allocUnsafe(1024 * 1024)
  try {
    let bytesRead
    do {
      bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, null)
      if (bytesRead > 0) hash.update(buffer.subarray(0, bytesRead))
    } while (bytesRead > 0)
  } finally {
    fs.closeSync(descriptor)
  }
  return hash.digest('hex')
}

function readJson(file) {
  const text = fs.readFileSync(file, 'utf8')
  return JSON.parse(text)
}

function assertReadOnlyStatement(sql) {
  if (typeof sql !== 'string' || !sql.trim()) throw new Error('attempted to run an empty SQL statement')
  const statement = sql.trim()
  if (!/^SELECT\b/i.test(statement)) {
    throw new Error('audit SQL guard rejected a statement that is not a SELECT')
  }
  if (/;\s*\S/.test(statement)) {
    throw new Error('audit SQL guard rejected multiple SQL statements')
  }
  if (FORBIDDEN_SQL.test(statement)) {
    throw new Error('audit SQL guard rejected a write/DDL/administrative keyword')
  }
  if (FORBIDDEN_EXPLAIN.test(statement)) {
    throw new Error('audit SQL guard rejected EXPLAIN or STRING_AGG')
  }
  return statement
}

function validateManifest(manifest) {
  const errors = []
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error('manifest must be a JSON object')
  }
  const allowedClassifications = new Set([
    'exact_parity',
    'duplicate_collapse',
    'intentional_source_sentinel_or_dangling_reference',
    'missing_valid_data',
    'genuine_application_defect',
    'unknown',
  ])
  const allowedTags = new Set([
    'ambiguous',
    'legacy_sentinel',
    'legacy_sentinel_candidate',
    'mixed_namespace',
    'polymorphic_namespace',
    'provenance_unverified',
    'source_unavailable',
    'unresolved_lineage',
    'source_backed_review_closed',
  ])
  const checkIds = new Set([
    'books', 'service_content', 'service_links', 'service_types', 'service_state',
    'narrator_core', 'narrator_biography', 'narrator_grading', 'narrator_criticism',
    'narrator_teachers', 'narrator_relations', 'takhrij', 'matn', 'lexicon', 'topics',
    'quran', 'isnad', 'judgments', 'controversy',
  ])

  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error('manifest must be a JSON object')
  }
  if (manifest.manifestVersion !== 1) errors.push('manifestVersion must be 1')
  if (!Array.isArray(manifest.allowedClassifications) ||
      manifest.allowedClassifications.some((value) => !allowedClassifications.has(value))) {
    errors.push('allowedClassifications is invalid')
  }
  if (!Array.isArray(manifest.allowedTags) ||
      manifest.allowedTags.some((value) => !allowedTags.has(value))) {
    errors.push('allowedTags is invalid')
  }
  if (!manifest.bookCountSemantics || manifest.bookCountSemantics.catalogTotal !== 245 ||
      !manifest.bookCountSemantics.meaning) {
    errors.push('bookCountSemantics must record the 245-book catalog meaning')
  }
  if (!Array.isArray(manifest.duplicateCollapseDecisions) || manifest.duplicateCollapseDecisions.length === 0) {
    errors.push('duplicateCollapseDecisions must be a non-empty array')
  } else {
    manifest.duplicateCollapseDecisions.forEach((decision, index) => {
      if (!decision || typeof decision.area !== 'string' || !Array.isArray(decision.key) ||
          decision.key.length === 0 || typeof decision.decision !== 'string') {
        errors.push(`duplicateCollapseDecisions[${index}] is invalid`)
      }
    })
  }
  if (!Array.isArray(manifest.mappings) || manifest.mappings.length === 0) {
    errors.push('mappings must be a non-empty array')
    throw new Error(errors.join('; '))
  }

  const ids = new Set()
  manifest.mappings.forEach((mapping, index) => {
    const prefix = `mappings[${index}]`
    if (!mapping || typeof mapping !== 'object') {
      errors.push(`${prefix} must be an object`)
      return
    }
    for (const field of ['id', 'roadmapArea', 'sourceTable', 'checkId', 'expectedClassification', 'reason']) {
      if (typeof mapping[field] !== 'string' || !mapping[field].trim()) errors.push(`${prefix}.${field} is required`)
    }
    if (ids.has(mapping.id)) errors.push(`${prefix}.id is duplicated: ${mapping.id}`)
    ids.add(mapping.id)
    if (!Array.isArray(mapping.webTables) || mapping.webTables.length === 0 ||
        mapping.webTables.some((table) => !SAFE_IDENTIFIER.test(table))) {
      errors.push(`${prefix}.webTables must contain plain identifiers`)
    }
    if (!mapping.keySemantics || !Array.isArray(mapping.keySemantics.source) ||
        !Array.isArray(mapping.keySemantics.web) || typeof mapping.keySemantics.description !== 'string') {
      errors.push(`${prefix}.keySemantics is invalid`)
    }
    if (!checkIds.has(mapping.checkId)) errors.push(`${prefix}.checkId is unsupported: ${mapping.checkId}`)
    if (!allowedClassifications.has(mapping.expectedClassification)) {
      errors.push(`${prefix}.expectedClassification is unsupported`)
    }
    if (!Array.isArray(mapping.tags) || mapping.tags.some((tag) => !allowedTags.has(tag))) {
      errors.push(`${prefix}.tags contains an unsupported tag`)
    }
    if (!mapping.sourceEvidence || typeof mapping.sourceEvidence.status !== 'string' ||
        typeof mapping.sourceEvidence.reference !== 'string') {
      errors.push(`${prefix}.sourceEvidence is invalid`)
    } else if (mapping.sourceEvidence.status === 'completed_assessment_verified') {
      const contract = COMPLETED_ASSESSMENT_CONTRACTS[mapping.id]
      if (!contract) {
        errors.push(`${prefix} claims completed-assessment parity without a supported invariant contract`)
      } else {
        for (const [field, getExpected] of contract.requiredEvidence) {
          if (!hasVerificationValue(getExpected(mapping.sourceEvidence))) {
            errors.push(`${prefix}.sourceEvidence.${field} must be present for completed-assessment parity`)
          }
        }
        for (const [field, getExpected] of contract.requiredMapping || []) {
          if (!hasVerificationValue(getExpected(mapping))) {
            errors.push(`${prefix}.${field} must be present for completed-assessment parity`)
          }
        }
      }
    }
    if (typeof mapping.verificationQuery !== 'string') {
      errors.push(`${prefix}.verificationQuery is required`)
    } else {
      try {
        assertReadOnlyStatement(mapping.verificationQuery)
      } catch (error) {
        errors.push(`${prefix}.verificationQuery failed read-only validation: ${error.message}`)
      }
    }
  })

  const requiredUnknownIds = [
    'narrator_biography_provenance',
    'narrator_criticism',
    'quran_reader_ayat_namespaces',
    'controversy_description_namespaces',
  ]
  for (const id of requiredUnknownIds) {
    const mapping = manifest.mappings.find((item) => item.id === id)
    if (!mapping || mapping.expectedClassification !== 'unknown' || !mapping.tags.includes('ambiguous')) {
      errors.push(`${id} must be explicitly classified as an ambiguous unknown`)
    }
  }

  if (errors.length > 0) throw new Error(errors.join('; '))
  return manifest
}

function loadManifest(file) {
  return validateManifest(readJson(file))
}

function sanitizeMessage(value) {
  return String(value || 'unknown error')
    .replace(/postgres(?:ql)?:\/\/[^\s'"]+/gi, '[redacted database URL]')
    .replace(/DATABASE_URL\s*=\s*[^\s;]+/gi, 'DATABASE_URL=[redacted]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1000)
}

function errorDetails(error) {
  return {
    name: error && error.name ? String(error.name) : 'Error',
    code: error && error.code != null ? String(error.code) : null,
    message: sanitizeMessage(error && error.message ? error.message : error),
  }
}

function gitValue(args) {
  return execFileSync('git', args, {
    cwd: ROOT,
    encoding: 'utf8',
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}

function repositoryMetadata() {
  try {
    const commit = gitValue(['rev-parse', 'HEAD'])
    const rawStatus = execFileSync(
      'git', ['status', '--porcelain=v1', '-z', '--untracked-files=all'],
      {
        cwd: ROOT,
        encoding: 'buffer',
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    )
    const statusText = rawStatus.toString('utf8')
    const entries = statusText.split('\0').filter(Boolean)
    return {
      commit,
      commitShort: commit.slice(0, 12),
      dirty: entries.length > 0,
      dirtyStatus: entries.length > 0 ? 'dirty' : 'clean',
      dirtyEntryCount: entries.length,
      dirtyStatusSha256: sha256Buffer(rawStatus),
      dirtyStatusEntries: entries,
      statusCommand: 'git status --porcelain=v1 -z --untracked-files=all',
    }
  } catch (error) {
    return {
      commit: null,
      commitShort: null,
      dirty: null,
      dirtyStatus: 'unavailable',
      dirtyEntryCount: null,
      dirtyStatusSha256: null,
      dirtyStatusEntries: [],
      error: errorDetails(error),
    }
  }
}

function sourceEvidenceMetadata(explicitPath) {
  const candidates = explicitPath
    ? [resolveFromRoot(explicitPath)]
    : [
        path.join(ROOT, 'db-backup', 'source-audit-evidence.json'),
        path.join(ROOT, 'legacy-audit', 'harness', 'source_audit_evidence.json'),
        path.join(ROOT, 'legacy-audit', 'source_audit_evidence.json'),
        path.join(ROOT, 'legacy-audit', 'harness', 'source_fingerprint.json'),
      ]
  const attempted = []

  for (const candidate of candidates) {
    attempted.push(displayPath(candidate))
    try {
      const stat = fs.statSync(candidate)
      if (!stat.isFile()) {
        attempted.push('not-a-file')
        continue
      }
      if (stat.size > MAX_EVIDENCE_BYTES) {
        attempted.push(`file-too-large:${stat.size}`)
        continue
      }
      const evidence = readJson(candidate)
      if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) {
        throw new Error('source evidence must be a JSON object')
      }
      const evidenceDigest = sha256File(candidate)
      return {
        status: evidence.sourceFingerprint ? 'available' : 'evidence_only',
        available: Boolean(evidence.sourceFingerprint),
        path: displayPath(candidate),
        evidenceFileSha256: evidenceDigest,
        generatedAt: typeof evidence.generatedAt === 'string' ? evidence.generatedAt : null,
        producer: typeof evidence.producer === 'string' ? evidence.producer : null,
        sourceRevision: typeof evidence.sourceRevision === 'string' ? evidence.sourceRevision : null,
        sourceFingerprint: evidence.sourceFingerprint && typeof evidence.sourceFingerprint === 'object'
          ? evidence.sourceFingerprint
          : null,
        note: evidence.sourceFingerprint
          ? 'Legacy source fingerprint supplied by the optional evidence file.'
          : 'Evidence file was found, but it does not contain sourceFingerprint; no broad source parity is claimed.',
      }
    } catch (error) {
      if (error && error.code === 'ENOENT') attempted.push('missing')
      else attempted.push(`unreadable:${sanitizeMessage(error.message)}`)
    }
  }

  return {
    status: 'unavailable',
    available: false,
    path: null,
    evidenceFileSha256: null,
    generatedAt: null,
    producer: null,
    sourceRevision: null,
    sourceFingerprint: null,
    attemptedPaths: attempted,
    note: 'Fresh legacy source data/evidence is unavailable. This run validates web invariants and records assessment evidence, but does not claim a fresh source-to-web set comparison.',
  }
}

function recordQuery(report, entry) {
  report.queryLog.push({
    id: entry.id,
    status: entry.status,
    durationMs: entry.durationMs,
    sql: entry.sql,
    error: entry.error || null,
  })
}

async function guardedQuery(client, report, id, sql, params) {
  const safeSql = assertReadOnlyStatement(sql)
  const startedAt = Date.now()
  try {
    const result = await client.query(safeSql, params)
    recordQuery(report, { id, sql: safeSql, status: 'pass', durationMs: Date.now() - startedAt })
    return result
  } catch (error) {
    const status = error && error.code === '57014' ? 'timeout' : 'error'
    recordQuery(report, {
      id,
      sql: safeSql,
      status,
      durationMs: Date.now() - startedAt,
      error: errorDetails(error),
    })
    throw error
  }
}

async function withReadOnlyClient(client, settings, callback, lifecycle) {
  let connectAttempted = false
  let connected = false
  let beginAttempted = false
  let transactionOpen = false
  let callbackValue

  Object.assign(lifecycle, {
    connected: false,
    beginReadOnly: { status: 'not_run' },
    readOnlyGuard: { status: 'not_run' },
    settings: {},
    queryLog: [],
    rollback: { status: 'not_needed' },
    close: { status: 'not_needed' },
  })

  let primaryError = null
  try {
    connectAttempted = true
    await client.connect()
    connected = true
    lifecycle.connected = true

    const beginStarted = Date.now()
    beginAttempted = true
    try {
      await client.query('BEGIN READ ONLY')
      transactionOpen = true
      lifecycle.beginReadOnly = { status: 'pass', durationMs: Date.now() - beginStarted }
    } catch (error) {
      lifecycle.beginReadOnly = { status: 'error', durationMs: Date.now() - beginStarted, error: errorDetails(error) }
      throw error
    }

    const readOnlyResult = await guardedQuery(
      client,
      lifecycle,
      'guard.transaction_read_only',
      "SELECT current_setting('transaction_read_only')::text AS transaction_read_only",
    )
    if (readOnlyResult.rows[0]?.transaction_read_only !== 'on') {
      throw new Error('PostgreSQL did not enable transaction_read_only; audit stopped')
    }
    lifecycle.readOnlyGuard = { status: 'pass' }

    const settingDefinitions = [
      ['statement_timeout', String(settings.statementTimeoutMs)],
      ['work_mem', `${settings.workMemMb}MB`],
      ['max_parallel_workers_per_gather', '0'],
      ['lock_timeout', '10000ms'],
      ['idle_in_transaction_session_timeout', String(settings.statementTimeoutMs + 15_000)],
    ]
    for (const [name, value] of settingDefinitions) {
      const result = await guardedQuery(
        client,
        lifecycle,
        `settings.${name}`,
        'SELECT set_config($1, $2, true)::text AS configured_value',
        [name, value],
      )
      lifecycle.settings[name] = {
        requested: value,
        returned: result.rows[0]?.configured_value ?? null,
        status: 'pass',
      }
    }

    callbackValue = await callback({
      query: (id, sql, params) => guardedQuery(client, lifecycle, id, sql, params),
    })
  } catch (error) {
    primaryError = error
  } finally {
    if (connected && beginAttempted) {
      const rollbackStarted = Date.now()
      lifecycle.rollback = { status: 'attempted' }
      try {
        await client.query('ROLLBACK')
        lifecycle.rollback = {
          status: transactionOpen ? 'pass' : 'error',
          durationMs: Date.now() - rollbackStarted,
          ...(transactionOpen ? {} : { error: { name: 'Error', code: null, message: 'BEGIN READ ONLY did not complete; rollback was attempted defensively' } }),
        }
      } catch (error) {
        lifecycle.rollback = {
          status: 'error',
          durationMs: Date.now() - rollbackStarted,
          error: errorDetails(error),
        }
        if (!primaryError) primaryError = error
      }
    }

    if (connectAttempted) {
      const closeStarted = Date.now()
      try {
        await client.end()
        lifecycle.close = { status: 'pass', durationMs: Date.now() - closeStarted }
      } catch (error) {
        lifecycle.close = {
          status: 'error',
          durationMs: Date.now() - closeStarted,
          error: errorDetails(error),
        }
        if (!primaryError) primaryError = error
      }
    }
  }

  if (primaryError) throw primaryError
  return callbackValue
}

function hasVerificationValue(value) {
  return value !== undefined && value !== null
}

function verificationValuesEqual(actual, expected) {
  if (Array.isArray(expected) || Array.isArray(actual)) {
    return JSON.stringify(actual) === JSON.stringify(expected)
  }
  if (typeof expected === 'boolean') return actual === expected || actual === 't'
  return String(actual) === String(expected)
}

function completedAssessmentCheck(label, actual, expected, scope = 'verification') {
  if (!hasVerificationValue(expected)) {
    return { kind: 'unknown', detail: `${scope} expectation ${label} is unavailable` }
  }
  if (!hasVerificationValue(actual)) {
    return { kind: 'unknown', detail: `${scope} value ${label} is unavailable` }
  }
  if (!verificationValuesEqual(actual, expected)) {
    return { kind: 'failure', detail: `${label} ${JSON.stringify(actual)} != assessed ${JSON.stringify(expected)}` }
  }
  return { kind: 'pass' }
}

function nestedValue(container, field) {
  if (!container || typeof container !== 'object') return undefined
  const segments = field.split('.')
  let value = container
  for (const segment of segments) {
    if (!value || typeof value !== 'object' || !Object.prototype.hasOwnProperty.call(value, segment)) return undefined
    value = value[segment]
  }
  return value
}

function completedAssessmentCheckResults(mapping, web) {
  const contract = COMPLETED_ASSESSMENT_CONTRACTS[mapping.id]
  if (!contract) {
    return {
      unknowns: [`mapping ${mapping.id} has no supported completed-assessment invariant contract`],
      failures: [],
      checks: [],
    }
  }

  const evidence = mapping.sourceEvidence || {}
  const observations = web && typeof web === 'object' ? web : {}
  const checks = []
  for (const [field, getExpected] of contract.requiredEvidence) {
    const expected = getExpected(evidence)
    checks.push({
      scope: 'assessment',
      field,
      result: completedAssessmentCheck(field, nestedValue(evidence, field), expected, 'assessment'),
    })
  }
  for (const [field, getExpected] of contract.requiredMapping || []) {
    const expected = getExpected(mapping)
    checks.push({
      scope: 'assessment',
      field,
      result: completedAssessmentCheck(field, nestedValue(mapping, field), expected, 'assessment'),
    })
  }
  for (const [field, getExpected] of contract.webChecks) {
    checks.push({
      scope: 'current',
      field,
      result: completedAssessmentCheck(field, observations[field], getExpected(evidence, mapping)),
    })
  }
  for (const field of contract.observedWebChecks || []) {
    checks.push({
      scope: 'current_observation',
      field,
      result: hasVerificationValue(observations[field])
        ? { kind: 'pass' }
        : { kind: 'unknown', detail: `current verification ${field} is unavailable` },
    })
  }
  for (const [field, expected] of contract.booleanChecks || []) {
    checks.push({
      scope: 'current',
      field,
      result: completedAssessmentCheck(field, observations[field], expected),
    })
  }

  return {
    unknowns: checks.filter((check) => check.result.kind === 'unknown').map((check) => check.result.detail),
    failures: checks.filter((check) => check.result.kind === 'failure').map((check) => check.result.detail),
    checks,
  }
}

function completedAssessmentInvariants(mapping, web) {
  const results = completedAssessmentCheckResults(mapping, web)
  return [...results.unknowns, ...results.failures]
}

function repairStatusFor(classification) {
  switch (classification) {
    case 'exact_parity': return 'not_required'
    case 'duplicate_collapse': return 'not_required_duplicate_collapse_decision_recorded'
    case 'intentional_source_sentinel_or_dangling_reference':
      return 'not_required_legacy_sentinel_or_dangling_reference'
    case 'unknown': return 'requires_semantic_review_no_write_performed'
    case 'missing_valid_data':
    case 'genuine_application_defect': return 'not_attempted_read_only_audit'
    default: return 'unclassified'
  }
}

function classifyMapping(mapping, web) {
  const evidence = mapping.sourceEvidence
  if (evidence.status === 'ambiguous') {
    return {
      classification: 'unknown',
      reason: mapping.reason,
    }
  }
  if (evidence.status === 'completed_assessment_verified') {
    const results = completedAssessmentCheckResults(mapping, web)
    if (results.unknowns.length > 0) {
      return {
        classification: 'unknown',
        reason: `Completed-assessment verification is incomplete: ${results.unknowns.join('; ')}. No parity classification is claimed.`,
      }
    }
    if (results.failures.length > 0) {
      return {
        classification: 'genuine_application_defect',
        reason: `Current web invariants differ from the completed assessment: ${results.failures.join('; ')}. No repair was attempted.`,
      }
    }
    return {
      classification: mapping.expectedClassification,
      reason: `${mapping.reason} All required current web invariants match the completed assessment.`,
    }
  }
  return {
    classification: 'unknown',
    reason: `${mapping.reason} Fresh legacy source keys are unavailable, so current source-to-web parity is not claimed.`,
  }
}

function sourceMetrics(evidence) {
  return {
    rawRows: evidence.rawRows ?? null,
    distinctKeys: evidence.distinctKeys ?? null,
    duplicateRows: evidence.duplicateRows ?? null,
    missingValidKeys: evidence.missingValidKeys ?? null,
    extraWebKeys: evidence.extraWebKeys ?? null,
    status: evidence.status,
    reference: evidence.reference,
  }
}

function webMetrics(row) {
  return {
    rawRows: row && Object.prototype.hasOwnProperty.call(row, 'raw_rows') ? row.raw_rows : null,
    distinctKeys: row && Object.prototype.hasOwnProperty.call(row, 'distinct_keys') ? row.distinct_keys : null,
    duplicateRows: row && Object.prototype.hasOwnProperty.call(row, 'duplicate_rows') ? row.duplicate_rows : null,
    directObservations: row || {},
  }
}

function findingForMapping(mapping, webRow, queryStatus) {
  const source = sourceMetrics(mapping.sourceEvidence)
  const web = webMetrics(webRow)
  let classification
  let reason
  if (queryStatus !== 'pass') {
    classification = 'unknown'
    reason = `Database verification query ${queryStatus}; no classification is claimed from incomplete web evidence.`
  } else {
    const classified = classifyMapping(mapping, webRow)
    classification = classified.classification
    reason = classified.reason
  }
  return {
    id: mapping.id,
    roadmapArea: mapping.roadmapArea,
    sourceTable: mapping.sourceTable,
    webTables: mapping.webTables,
    keySemantics: mapping.keySemantics,
    source,
    web,
    missingValidKeys: source.missingValidKeys,
    extraWebKeys: source.extraWebKeys,
    classification,
    assessmentClassification: mapping.expectedClassification,
    reason,
    tags: mapping.tags,
    repairStatus: repairStatusFor(classification),
    queryStatus,
    verificationQuery: mapping.verificationQuery,
    ...(mapping.sourceEvidence.status === 'completed_assessment_verified'
      ? { completedAssessmentInvariants: completedAssessmentCheckResults(mapping, webRow).checks }
      : {}),
  }
}

function inheritedDanglingReferences(manifest) {
  const byId = new Map(manifest.mappings.map((mapping) => [mapping.id, mapping.sourceEvidence]))
  return [
    {
      area: 'matn_comparisons',
      references: byId.get('matn_hadith_comparisons')?.invalidDistinctKeys ?? null,
      classification: 'intentional_source_sentinel_or_dangling_reference',
      reason: 'Invalid legacy pair components were excluded; 7,820,313 valid pairs were assessed as matched.',
    },
    {
      area: 'narrator_relations',
      references: byId.get('narrator_relations')?.legacySentinelRawRows ?? null,
      classification: 'intentional_source_sentinel_or_dangling_reference',
      reason: 'Inherited SecondRawyID=0 source rows are duplicate-collapsed and excluded from direct narrator joins.',
    },
    {
      area: 'lexicon_references',
      references: byId.get('lexicon_hadith_references')?.excludedSourceKeys ?? null,
      classification: 'intentional_source_sentinel_or_dangling_reference',
      reason: 'The historical source set includes out-of-range/composite namespace candidates that are not treated as ordinary hadith keys.',
    },
    {
      area: 'quran_references',
      references: byId.get('quran_reader_ayat_namespaces')?.knownDirectQuranAyaJoinFailures ?? null,
      classification: 'unknown',
      reason: 'Source-backed semantic review closed the Quran reader/ayat boundary: all assessed aya_id values fail direct quran_ayat.id joins, and the source namespace is preserved without a guessed remap.',
    },
    {
      area: 'controversy_trees',
      references: byId.get('controversy_description_namespaces')?.knownMixedNamespaceNodeIds ?? null,
      classification: 'unknown',
      reason: 'Source-backed semantic review closed the mixed controversy namespace: 22 node IDs remain in their source namespace and no remap is assumed.',
    },
    {
      area: 'narrator_biography',
      references: null,
      classification: 'unknown',
      reason: 'Source-backed semantic review closed biography provenance as a documented NounsTranslation-to-BookTOC_Services expansion; no raw-row parity or repair is claimed.',
    },
    {
      area: 'narrator_criticism',
      references: null,
      classification: 'unknown',
      reason: 'Source-backed semantic review closed criticism lineage as the documented NounsScientistsSays-to-NounsScientists join with source namespace preservation; unresolved duplicates are not guessed away.',
    },
  ]
}

function formatValue(value) {
  if (value == null) return 'not available'
  if (typeof value === 'boolean') return value ? 'yes' : 'no'
  if (Array.isArray(value)) return value.length > 0 ? value.map((item) => JSON.stringify(item)).join(', ') : '[]'
  if (typeof value === 'object') return '`' + JSON.stringify(value).replace(/`/g, '\\`') + '`'
  return String(value)
}

function markdownCode(sql) {
  return ['```sql', sql.replace(/\s+$/u, ''), '```'].join('\n')
}

function renderMarkdown(report) {
  const lines = [
    '# Phase 1 read-only data audit',
    '',
    `- **Status:** ${report.status}`,
    `- **Started:** ${report.timestamps.startedAt}`,
    `- **Completed:** ${report.timestamps.completedAt || 'not completed'}`,
    `- **Duration:** ${report.timestamps.durationMs == null ? 'not available' : `${report.timestamps.durationMs} ms`}`,
    `- **Web commit:** ${report.repository.commit || 'unavailable'}`,
    `- **Dirty state:** ${report.repository.dirtyStatus} (${report.repository.dirtyEntryCount ?? '?'} entries; status SHA-256 \`${report.repository.dirtyStatusSha256 || 'unavailable'}\`)`,
    `- **Legacy source fingerprint:** ${report.source.status}${report.source.sourceFingerprint ? ' (available)' : ''}`,
    `- **Manifest:** \`${report.manifest.path}\` (SHA-256 \`${report.manifest.sha256}\`)`,
    '',
    '## Safety boundary',
    '',
    `- Transaction: \`${report.safety.beginReadOnly.status}\`; read-only assertion: \`${report.safety.readOnlyGuard.status}\`.`,
    `- Rollback: \`${report.safety.rollback.status}\`; client close: \`${report.safety.close.status}\`.`,
    `- Statement timeout: \`${report.settings.statementTimeoutMs} ms\`; work_mem: \`${report.settings.workMemMb} MB\`; parallel workers per gather: \`0\`.`,
    '- No DDL, DML, migrations, ANALYZE, temporary tables, destructive commands, or repairs were run.',
    '- The database URL is resolved only through `db/dbenv.js` and is not recorded in this report.',
    '',
    '## Database metadata',
    '',
  ]

  if (report.database.status === 'connected') {
    const db = report.database
    lines.push(
      `- Database: \`${db.databaseName}\``,
      `- PostgreSQL: \`${db.serverVersion}\` (${db.serverVersionNum})`,
      `- Recovery mode: ${formatValue(db.inRecovery)}`,
      `- Server started: ${formatValue(db.serverStartedAt)}`,
      `- transaction_read_only: \`${db.transactionReadOnly}\``,
    )
  } else {
    lines.push(`- Database status: **${report.database.status}**.`)
    if (report.database.error) lines.push(`- Reason: ${report.database.error.message}`)
  }

  lines.push('', '## Source evidence boundary', '')
  lines.push(`- ${report.source.note}`)
  if (report.source.path) lines.push(`- Evidence path: \`${report.source.path}\`; evidence-file SHA-256: \`${report.source.evidenceFileSha256}\`.`)
  if (report.source.sourceFingerprint) {
    lines.push('- Fingerprint object:', '', markdownCode(JSON.stringify(report.source.sourceFingerprint, null, 2)))
  }
  lines.push(
    `- ${report.bookCountSemantics.meaning}`,
    `- Catalog semantics: \`Book/books=${report.bookCountSemantics.catalogTotal}\`; the runner also records hadith/service book projections separately.`,
    '',
    '## Duplicate-collapse decisions',
    '',
  )
  report.duplicateCollapseDecisions.forEach((decision) => {
    lines.push(`- **${decision.area}** on \`(${decision.key.join(', ')})\`: ${decision.decision}`)
  })

  lines.push('', '## Inherited source dangling references', '')
  report.inheritedSourceDanglingReferences.forEach((item) => {
    lines.push(`- **${item.area}** (${formatValue(item.references)}): ${item.classification} — ${item.reason}`)
  })

  lines.push('', '## Summary', '')
  lines.push(`- Findings: ${report.summary.total}`)
  Object.entries(report.summary.byClassification).forEach(([classification, count]) => {
    lines.push(`- \`${classification}\`: ${count}`)
  })
  lines.push(`- Query pass: ${report.summary.queryPass}; query error/timeout: ${report.summary.queryFailed}; not run: ${report.summary.queryNotRun}`)

  lines.push('', '## Findings', '')
  for (const finding of report.findings) {
    lines.push(
      `### ${finding.id}`,
      '',
      `- Roadmap area: ${finding.roadmapArea}`,
      `- Source table: \`${finding.sourceTable}\``,
      `- Web table(s): ${finding.webTables.map((table) => `\`${table}\``).join(', ')}`,
      `- Key semantics: ${finding.keySemantics.description}`,
      `- Source evidence: ${finding.source.status}; reference: ${finding.source.reference}`,
      `- Source raw rows / distinct keys / duplicate rows: ${formatValue(finding.source.rawRows)} / ${formatValue(finding.source.distinctKeys)} / ${formatValue(finding.source.duplicateRows)}`,
      `- Web raw rows / distinct keys / duplicate rows: ${formatValue(finding.web.rawRows)} / ${formatValue(finding.web.distinctKeys)} / ${formatValue(finding.web.duplicateRows)}`,
      `- Missing valid keys / extra web keys: ${formatValue(finding.missingValidKeys)} / ${formatValue(finding.extraWebKeys)}`,
      `- Classification: **${finding.classification}** (assessment baseline: \`${finding.assessmentClassification}\`)`,
      `- Reason: ${finding.reason}`,
      `- Repair status: ${finding.repairStatus}`,
      `- Query status: \`${finding.queryStatus}\``,
      `- Tags: ${finding.tags.length > 0 ? finding.tags.map((tag) => `\`${tag}\``).join(', ') : 'none'}`,
      '- Direct web observations:',
      '',
      markdownCode(JSON.stringify(finding.web.directObservations, null, 2)),
      '',
      'Reproducible verification query:',
      '',
      markdownCode(finding.verificationQuery),
      '',
    )
  }

  lines.push('## Query log', '')
  for (const query of report.queryLog) {
    const suffix = query.error ? ` — ${query.error.code || query.error.name}: ${query.error.message}` : ''
    lines.push(`- \`${query.id}\`: ${query.status}; ${query.durationMs} ms${suffix}`)
  }
  lines.push('')
  return lines.join('\n')
}

function pathIsWithin(parent, candidate, allowEqual = true) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate))
  if (relative === '') return allowEqual
  return !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative)
}

function assertPathHasNoNul(file, label) {
  if (String(file).includes('\0')) throw new Error(`${label} contains a NUL byte`)
}

function lstatIfPresent(file) {
  try {
    return fs.lstatSync(file)
  } catch (error) {
    if (error && error.code === 'ENOENT') return null
    throw error
  }
}

function nearestExistingPath(file) {
  let current = path.resolve(file)
  for (;;) {
    if (lstatIfPresent(current)) return current
    const parent = path.dirname(current)
    if (parent === current) {
      throw new Error(`cannot find an existing parent for output path ${displayPath(file)}`)
    }
    current = parent
  }
}

function physicalPathForContainment(file) {
  const resolved = path.resolve(file)
  const existing = nearestExistingPath(resolved)
  const physicalBase = fs.realpathSync.native(existing)
  const relative = path.relative(existing, resolved)
  return relative ? path.resolve(physicalBase, relative) : physicalBase
}

function assertNoLinkBetween(target, boundary, label) {
  const resolvedTarget = path.resolve(target)
  const resolvedBoundary = path.resolve(boundary)
  if (!pathIsWithin(resolvedBoundary, resolvedTarget)) {
    throw new Error(`${label} ${displayPath(resolvedTarget)} is outside ${displayPath(resolvedBoundary)}`)
  }

  let current = resolvedTarget
  for (;;) {
    const stat = lstatIfPresent(current)
    if (stat && stat.isSymbolicLink()) {
      throw new Error(`${label} ${displayPath(resolvedTarget)} traverses a symlink or junction at ${displayPath(current)}`)
    }
    if (current === resolvedBoundary) return
    const parent = path.dirname(current)
    if (parent === current) throw new Error(`${label} path traversal did not reach ${displayPath(resolvedBoundary)}`)
    current = parent
  }
}

function isWindowsJunctionOrReparsePoint(stat) {
  if (!stat) return false
  if (stat.isSymbolicLink()) return true
  if (process.platform !== 'win32' || typeof stat.mode !== 'number') return false
  // Node exposes FILE_ATTRIBUTE_REPARSE_POINT through the high mode bits on Windows.
  return (stat.mode & 0o170000) === 0o120000 || Boolean(stat.reparsePoint)
}

function assertNoLinkBetweenOrReparse(target, boundary, label) {
  assertNoLinkBetween(target, boundary, label)
  if (process.platform !== 'win32') return

  const resolvedTarget = path.resolve(target)
  const resolvedBoundary = path.resolve(boundary)
  const relative = path.relative(resolvedBoundary, resolvedTarget)
  const segments = relative ? relative.split(path.sep).filter(Boolean) : []
  let current = resolvedBoundary
  if (isWindowsJunctionOrReparsePoint(lstatIfPresent(current))) {
    throw new Error(`${label} ${displayPath(resolvedTarget)} traverses a symlink or junction at ${displayPath(current)}`)
  }
  for (const segment of segments) {
    current = path.join(current, segment)
    if (isWindowsJunctionOrReparsePoint(lstatIfPresent(current))) {
      throw new Error(`${label} ${displayPath(resolvedTarget)} traverses a symlink or junction at ${displayPath(current)}`)
    }
  }
}

function gitResult(args, repoRoot) {
  const result = spawnSync('git', args, {
    cwd: repoRoot,
    windowsHide: true,
    stdio: ['ignore', 'ignore', 'pipe'],
  })
  if (result.error) throw new Error(`git safety check failed to start: ${sanitizeMessage(result.error.message)}`)
  return result
}

function pathIsIgnored(file, repoRoot) {
  const result = gitResult(['check-ignore', '--quiet', '--', file], repoRoot)
  if (result.status === 0) return true
  if (result.status === 1) return false
  throw new Error(`git check-ignore failed for ${displayPath(file)} with exit code ${result.status}`)
}

function pathIsTracked(file, repoRoot) {
  if (!pathIsWithin(repoRoot, file)) return false
  const relative = path.relative(repoRoot, file)
  const result = gitResult(['ls-files', '--error-unmatch', '--', relative], repoRoot)
  if (result.status === 0) return true
  if (result.status === 1) return false
  throw new Error(`git ls-files failed for ${displayPath(file)} with exit code ${result.status}`)
}

function assertSafeAuditOutputDirectory(outputDir, options = {}) {
  assertPathHasNoNul(outputDir, 'audit output directory')
  const repoRoot = path.resolve(options.repoRoot || ROOT)
  const allowedRoot = path.resolve(options.allowedOutputRoot || (repoRoot === path.resolve(ROOT)
    ? AUDIT_OUTPUT_ROOT
    : path.join(repoRoot, 'db-backup')))
  const candidate = path.resolve(outputDir)
  const isIgnored = options.isIgnored || ((file) => pathIsIgnored(file, repoRoot))

  if (!pathIsWithin(repoRoot, allowedRoot) || allowedRoot === repoRoot) {
    throw new Error(`audit output root must be db-backup/ or a subdirectory inside the workspace: ${displayPath(allowedRoot)}`)
  }
  if (!pathIsWithin(allowedRoot, candidate)) {
    throw new Error(`audit output directory must be contained in ignored db-backup/: ${displayPath(candidate)}`)
  }
  if (!isIgnored(allowedRoot) || !isIgnored(candidate)) {
    throw new Error(`audit output path is not ignored by Git: ${displayPath(candidate)}`)
  }

  const repoPhysical = fs.realpathSync.native(repoRoot)
  const allowedPhysical = physicalPathForContainment(allowedRoot)
  if (!pathIsWithin(repoPhysical, allowedPhysical)) {
    throw new Error(`audit output root redirects outside the workspace: ${displayPath(allowedRoot)}`)
  }
  assertNoLinkBetweenOrReparse(allowedRoot, repoRoot, 'audit output root')

  const candidateStat = lstatIfPresent(candidate)
  if (candidateStat && isWindowsJunctionOrReparsePoint(candidateStat)) {
    throw new Error(`audit output path traverses a symlink or junction: ${displayPath(candidate)}`)
  }
  if (candidateStat && !candidateStat.isDirectory()) {
    throw new Error(`audit output path exists and is not a directory: ${displayPath(candidate)}`)
  }
  if (candidateStat) {
    assertNoLinkBetweenOrReparse(candidate, repoRoot, 'audit output directory')
    const candidatePhysical = fs.realpathSync.native(candidate)
    if (!pathIsWithin(allowedPhysical, candidatePhysical)) {
      throw new Error(`audit output directory redirects outside ignored db-backup/: ${displayPath(candidate)}`)
    }
  } else {
    const candidatePhysical = physicalPathForContainment(candidate)
    if (!pathIsWithin(allowedPhysical, candidatePhysical)) {
      throw new Error(`audit output directory would be created outside ignored db-backup/: ${displayPath(candidate)}`)
    }
  }

  return { outputDir: candidate, allowedRoot, physicalRoot: allowedPhysical }
}

function assertSafeReportPath(file, options = {}) {
  assertPathHasNoNul(file, 'audit report path')
  const repoRoot = path.resolve(options.repoRoot || ROOT)
  const allowedRoot = path.resolve(options.allowedOutputRoot || path.join(repoRoot, 'db-backup'))
  const candidate = path.resolve(file)
  const isIgnored = options.isIgnored || ((target) => pathIsIgnored(target, repoRoot))
  const isTracked = options.isTracked || ((target) => pathIsTracked(target, repoRoot))

  assertSafeAuditOutputDirectory(path.dirname(candidate), {
    repoRoot,
    allowedOutputRoot: allowedRoot,
    isIgnored,
  })
  if (!isIgnored(candidate)) {
    throw new Error(`audit report path is not ignored by Git: ${displayPath(candidate)}`)
  }
  if (isTracked(candidate)) {
    throw new Error(`refusing to overwrite tracked audit report: ${displayPath(candidate)}`)
  }

  const stat = lstatIfPresent(candidate)
  if (stat && (!stat.isFile() || isWindowsJunctionOrReparsePoint(stat))) {
    throw new Error(`refusing to overwrite a non-regular or redirected audit report: ${displayPath(candidate)}`)
  }
  if (stat && !options.allowExisting) {
    throw new Error(`refusing to overwrite an existing regular audit report: ${displayPath(candidate)}`)
  }
  if (stat) {
    const physical = fs.realpathSync.native(candidate)
    const allowedPhysical = fs.realpathSync.native(allowedRoot)
    if (!pathIsWithin(allowedPhysical, physical)) {
      throw new Error(`audit report redirects outside ignored db-backup/: ${displayPath(candidate)}`)
    }
  }
  return candidate
}

function prepareAuditOutputDirectory(outputDir, options = {}) {
  let safety = assertSafeAuditOutputDirectory(outputDir, options)
  if (!lstatIfPresent(safety.outputDir)) fs.mkdirSync(safety.outputDir, { recursive: true })
  safety = assertSafeAuditOutputDirectory(safety.outputDir, options)
  if (!lstatIfPresent(safety.outputDir).isDirectory()) {
    throw new Error(`audit output path is not a directory after creation: ${displayPath(safety.outputDir)}`)
  }
  return safety
}

function assertNoAuditReportsPresent(outputDir) {
  for (const filename of REPORT_FILENAMES) {
    const candidate = path.join(outputDir, filename)
    const stat = lstatIfPresent(candidate)
    if (stat) {
      throw new Error(`refusing to overwrite an existing audit report: ${displayPath(candidate)}`)
    }
  }
}

function atomicWrite(file, contents, options = {}) {
  const destination = assertSafeReportPath(file, options)
  if (lstatIfPresent(destination)) {
    throw new Error(`refusing to overwrite an existing regular audit report: ${displayPath(destination)}`)
  }
  const temp = `${destination}.tmp-${process.pid}-${crypto.randomBytes(8).toString('hex')}`
  let descriptor = null
  try {
    assertSafeReportPath(temp, options)
    descriptor = fs.openSync(temp, 'wx', 0o600)
    fs.writeFileSync(descriptor, contents, 'utf8')
    fs.fsyncSync(descriptor)
    fs.closeSync(descriptor)
    descriptor = null
    assertSafeAuditOutputDirectory(path.dirname(destination), options)
    if (lstatIfPresent(destination)) {
      throw new Error(`refusing to overwrite an existing regular audit report: ${displayPath(destination)}`)
    }
    // link() is create-if-absent on every supported platform; unlike rename(), it never
    // replaces a report that appeared after the preceding safety check.
    fs.linkSync(temp, destination)
    fs.unlinkSync(temp)
    assertSafeReportPath(destination, { ...options, allowExisting: true })
  } finally {
    if (descriptor != null) fs.closeSync(descriptor)
    try {
      fs.unlinkSync(temp)
    } catch (error) {
      if (!error || error.code !== 'ENOENT') throw error
    }
  }
}

function defaultOutputDir(now) {
  const stamp = now.toISOString().replace(/[:.]/g, '-')
  return path.join(AUDIT_OUTPUT_ROOT, 'audits', stamp)
}

function summarize(report) {
  const byClassification = {}
  const byQueryStatus = { pass: 0, error: 0, timeout: 0, not_run: 0 }
  for (const finding of report.findings) {
    byClassification[finding.classification] = (byClassification[finding.classification] || 0) + 1
    const status = Object.prototype.hasOwnProperty.call(byQueryStatus, finding.queryStatus)
      ? finding.queryStatus
      : 'error'
    byQueryStatus[status] += 1
  }
  return {
    total: report.findings.length,
    byClassification,
    queryPass: byQueryStatus.pass,
    queryFailed: byQueryStatus.error + byQueryStatus.timeout,
    queryNotRun: byQueryStatus.not_run,
  }
}

function markRemainingNotRun(report, startIndex) {
  if (startIndex < 0 || startIndex >= report.findings.length) return
  for (let i = startIndex; i < report.findings.length; i += 1) {
    const finding = report.findings[i]
    if (finding.queryStatus === 'pending') {
      finding.queryStatus = 'not_run'
      finding.classification = 'unknown'
      finding.reason = 'Audit stopped after an earlier query error/timeout; this mapping was not checked.'
      finding.repairStatus = repairStatusFor('unknown')
    }
  }
}

async function runAudit(options, outputDir) {
  const outputSafety = prepareAuditOutputDirectory(outputDir)
  assertNoAuditReportsPresent(outputSafety.outputDir)
  const manifestFile = resolveFromRoot(options.manifest)
  const manifest = loadManifest(manifestFile)
  const startedAt = new Date()
  const startedHr = process.hrtime.bigint()
  const report = {
    reportVersion: REPORT_VERSION,
    title: 'Hadith phase-1 mapping-aware read-only data audit',
    status: 'starting',
    timestamps: {
      startedAt: startedAt.toISOString(),
      completedAt: null,
      durationMs: null,
    },
    repository: repositoryMetadata(),
    source: sourceEvidenceMetadata(options.sourceEvidence),
    manifest: {
      path: displayPath(manifestFile),
      sha256: sha256File(manifestFile),
      version: manifest.manifestVersion,
      mappingCount: manifest.mappings.length,
    },
    settings: {
      statementTimeoutMs: options.statementTimeoutMs,
      workMemMb: options.workMemMb,
      maxParallelWorkersPerGather: 0,
    },
    safety: {},
    database: { status: 'not_started' },
    queryLog: [],
    findings: manifest.mappings.map((mapping) => findingForMapping(mapping, null, 'pending')),
    bookCountSemantics: manifest.bookCountSemantics,
    duplicateCollapseDecisions: manifest.duplicateCollapseDecisions,
    inheritedSourceDanglingReferences: inheritedDanglingReferences(manifest),
    summary: { total: manifest.mappings.length, byClassification: {}, queryPass: 0, queryFailed: 0, queryNotRun: 0 },
    outputs: {
      directory: displayPath(outputSafety.outputDir),
      allowedRoot: displayPath(outputSafety.allowedRoot),
      physicalRoot: displayPath(outputSafety.physicalRoot),
      ignoredByGit: true,
      overwriteExistingReports: false,
      json: displayPath(path.join(outputSafety.outputDir, 'data-audit.json')),
      markdown: displayPath(path.join(outputSafety.outputDir, 'data-audit.md')),
    },
  }

  const lifecycle = {}
  let currentFindingIndex = 0
  const client = new Client({
    connectionString: dbenv.url(),
    ssl: { rejectUnauthorized: false },
    application_name: 'hadith-readonly-data-audit',
    connectionTimeoutMillis: 15_000,
    query_timeout: options.statementTimeoutMs + 15_000,
  })

  try {
    await withReadOnlyClient(
      client,
      options,
      async ({ query }) => {
        report.database.status = 'connected'
        const metadataResult = await query('database.metadata', SERVER_METADATA_QUERY)
        const metadata = metadataResult.rows[0] || {}
        report.database = {
          status: 'connected',
          databaseName: metadata.database_name ?? null,
          databaseUser: metadata.database_user ?? null,
          serverVersion: metadata.server_version ?? null,
          serverVersionNum: metadata.server_version_num ?? null,
          inRecovery: metadata.in_recovery ?? null,
          serverStartedAt: metadata.server_started_at ? new Date(metadata.server_started_at).toISOString() : null,
          transactionReadOnly: metadata.transaction_read_only ?? null,
          configuredStatementTimeout: metadata.statement_timeout ?? null,
          configuredWorkMem: metadata.work_mem ?? null,
          configuredMaxParallelWorkers: metadata.max_parallel_workers_per_gather ?? null,
          configuredLockTimeout: metadata.lock_timeout ?? null,
          configuredIdleTransactionTimeout: metadata.idle_in_transaction_session_timeout ?? null,
        }
        if (metadata.transaction_read_only !== 'on') {
          throw new Error('transaction_read_only assertion failed after BEGIN READ ONLY')
        }

        for (currentFindingIndex = 0; currentFindingIndex < manifest.mappings.length; currentFindingIndex += 1) {
          const mapping = manifest.mappings[currentFindingIndex]
          const result = await query(`finding.${mapping.id}`, mapping.verificationQuery)
          const row = result.rows[0] || {}
          report.findings[currentFindingIndex] = findingForMapping(mapping, row, 'pass')
        }
        currentFindingIndex = manifest.mappings.length
      },
      lifecycle,
    )
    report.status = 'completed'
  } catch (error) {
    markRemainingNotRun(report, currentFindingIndex)
    const details = errorDetails(error)
    if (report.database.status === 'connected') report.status = details.code === '57014' ? 'incomplete_timeout' : 'incomplete_query_error'
    else report.status = 'database_unavailable'
    report.database = {
      ...report.database,
      status: report.database.status === 'connected' ? report.database.status : 'unavailable',
      error: details,
    }
    report.fatalError = details
  }

  report.safety = lifecycle
  report.queryLog = lifecycle.queryLog || []
  const completedAt = new Date()
  report.timestamps.completedAt = completedAt.toISOString()
  report.timestamps.durationMs = Number((process.hrtime.bigint() - startedHr) / 1_000_000n)
  report.summary = summarize(report)

  const findingStatuses = new Set(report.findings.map((finding) => finding.queryStatus))
  if (report.status === 'completed') {
    const classifications = new Set(report.findings.map((finding) => finding.classification))
    if (findingStatuses.has('not_run') || findingStatuses.has('error') || findingStatuses.has('timeout')) {
      report.status = 'completed_with_query_failures'
    } else if (classifications.has('missing_valid_data') || classifications.has('genuine_application_defect')) {
      report.status = 'completed_with_findings'
    } else if (classifications.has('unknown')) {
      report.status = 'completed_with_unknowns'
    } else {
      report.status = 'completed'
    }
  }

  const jsonPath = path.join(outputSafety.outputDir, 'data-audit.json')
  const markdownPath = path.join(outputSafety.outputDir, 'data-audit.md')
  atomicWrite(jsonPath, JSON.stringify(report, null, 2) + '\n')
  atomicWrite(markdownPath, renderMarkdown(report) + '\n')

  return {
    report,
    jsonPath,
    markdownPath,
    exitCode: report.status === 'completed' || report.status === 'completed_with_unknowns' ? 0 : 1,
  }
}

async function main() {
  let options
  try {
    options = parseArgs(process.argv.slice(2))
  } catch (error) {
    console.error(`Invalid options: ${error.message}\n\n${usage()}`)
    process.exitCode = 2
    return
  }
  if (options.help) {
    console.log(usage())
    return
  }

  const now = new Date()
  const outputDir = options.outputDir
    ? resolveFromRoot(options.outputDir)
    : defaultOutputDir(now)

  try {
    const result = await runAudit(options, outputDir)
    const report = result.report
    console.log(JSON.stringify({
      status: report.status,
      database: report.database.status,
      findings: report.summary.total,
      classifications: report.summary.byClassification,
      queryStatus: {
        pass: report.summary.queryPass,
        failed: report.summary.queryFailed,
        notRun: report.summary.queryNotRun,
      },
      readOnlyGuard: report.safety.readOnlyGuard.status || 'not_run',
      rollback: report.safety.rollback.status || 'not_run',
      json: displayPath(result.jsonPath),
      markdown: displayPath(result.markdownPath),
    }, null, 2))
    process.exitCode = result.exitCode
  } catch (error) {
    const details = errorDetails(error)
    console.error(JSON.stringify({ status: 'failed', error: details }, null, 2))
    process.exitCode = 2
  }
}

module.exports = {
  assertReadOnlyStatement,
  assertSafeAuditOutputDirectory,
  assertSafeReportPath,
  prepareAuditOutputDirectory,
  classifyMapping,
  completedAssessmentInvariants,
  inheritedDanglingReferences,
  loadManifest,
  parseArgs,
  renderMarkdown,
  repairStatusFor,
  sanitizeMessage,
  validateManifest,
  withReadOnlyClient,
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`FAILED: ${sanitizeMessage(error.message)}`)
    process.exitCode = 1
  })
}
