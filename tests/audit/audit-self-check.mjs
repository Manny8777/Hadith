#!/usr/bin/env node

import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import os from 'node:os'
import path from 'node:path'

const require = createRequire(import.meta.url)
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const audit = require('../../db/audit_data_readonly.js')

const manifest = audit.loadManifest(path.join(root, 'db', 'audit_manifest.json'))

const unknownMappings = manifest.mappings.filter((mapping) => mapping.expectedClassification === 'unknown')
assert.equal(unknownMappings.length, 4, 'manifest must retain all four semantic-review unknowns')
for (const mapping of unknownMappings) {
  assert.ok(mapping.tags.includes('ambiguous'), `${mapping.id} must be tagged ambiguous`)
}

const duplicateChecks = new Map()
for (const decision of manifest.duplicateCollapseDecisions) {
  duplicateChecks.set(decision.area, decision)
}
assert.ok(duplicateChecks.has('service_links'))
assert.ok(duplicateChecks.has('narrator_relations'))
assert.ok(duplicateChecks.has('takhrij_memberships'))
assert.ok(duplicateChecks.has('matn_hadith_comparisons'))

for (const sql of [
  'SELECT 1',
  'SELECT count(*)::bigint AS raw_rows FROM books',
  `SELECT current_setting('transaction_read_only')::text AS transaction_read_only`,
]) {
  assert.doesNotThrow(() => audit.assertReadOnlyStatement(sql))
}

for (const sql of [
  '',
  'WITH x AS (SELECT 1) DELETE FROM books',
  'SELECT 1; SELECT 2',
  'EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM hadith_toc',
  "SELECT string_agg(title, ',') FROM books",
  'VACUUM books',
  'SET LOCAL work_mem = \'1MB\'',
]) {
  assert.throws(() => audit.assertReadOnlyStatement(sql), undefined, `guard should reject: ${sql}`)
}

const relationWeb = {
  raw_rows: '11518',
  distinct_keys: '11518',
  duplicate_rows: '0',
  other_nonpositive_sentinels: '0',
  second_id_zero_sentinels: '3529',
  unresolved_positive_first_ids: '0',
  unresolved_positive_second_ids: '17',
}
const relationMapping = manifest.mappings.find((mapping) => mapping.id === 'narrator_relations')
assert.deepEqual(audit.completedAssessmentInvariants(relationMapping, relationWeb), [])

const badWeb = {
  ...relationWeb,
  raw_rows: '11517',
}
assert.match(audit.completedAssessmentInvariants(relationMapping, badWeb).join(' '), /11517/)

const relationWebWithUnresolvedSecondId = {
  ...relationWeb,
  unresolved_positive_second_ids: '1',
}
assert.match(
  audit.completedAssessmentInvariants(relationMapping, relationWebWithUnresolvedSecondId).join(' '),
  /unresolved_positive_second_ids "1" != assessed 17/,
)

const validManifest = structuredClone(manifest)
const invalidManifest = structuredClone(manifest)
invalidManifest.mappings[0].expectedClassification = 'looks_fine_to_me'
assert.throws(() => audit.validateManifest(invalidManifest), /expectedClassification/)
assert.doesNotThrow(() => audit.validateManifest(validManifest))

for (const [label, mutateEvidence] of [
  ['missing', (evidence) => { delete evidence.rawRows }],
  ['null', (evidence) => { evidence.rawRows = null }],
]) {
  const invalidEvidenceManifest = structuredClone(manifest)
  const relation = invalidEvidenceManifest.mappings.find((mapping) => mapping.id === 'narrator_relations')
  mutateEvidence(relation.sourceEvidence)
  assert.throws(
    () => audit.validateManifest(invalidEvidenceManifest),
    /sourceEvidence\.rawRows must be present for completed-assessment parity/,
    `${label} completed-assessment evidence must fail closed`,
  )
}

const relationWebWithMissingObservation = {
  ...relationWeb,
  distinct_keys: null,
}
assert.match(
  audit.completedAssessmentInvariants(relationMapping, relationWebWithMissingObservation).join(' '),
  /distinct_keys is unavailable/,
)

const contradictoryRelation = audit.classifyMapping(relationMapping, {
  ...relationWeb,
  unresolved_positive_second_ids: '18',
})
assert.equal(contradictoryRelation.classification, 'genuine_application_defect')
assert.match(contradictoryRelation.reason, /unresolved_positive_second_ids "18" != assessed 17/)
assert.notEqual(contradictoryRelation.classification, 'duplicate_collapse')

const missingWeb = audit.classifyMapping(relationMapping, {
  ...relationWeb,
  unresolved_positive_second_ids: undefined,
})
assert.equal(missingWeb.classification, 'unknown')
assert.match(missingWeb.reason, /unresolved_positive_second_ids is unavailable/)

const missingExpected = structuredClone(manifest)
const missingRelation = missingExpected.mappings.find((mapping) => mapping.id === 'narrator_relations')
delete missingRelation.sourceEvidence.expectedPolymorphicSecondIds
assert.throws(
  () => audit.validateManifest(missingExpected),
  /expectedPolymorphicSecondIds must be present for completed-assessment parity/,
)

const missingWebField = audit.classifyMapping(relationMapping, {
  ...relationWeb,
  unresolved_positive_second_ids: null,
})
assert.equal(missingWebField.classification, 'unknown')
assert.match(missingWebField.reason, /unresolved_positive_second_ids is unavailable/)

const safeOutputRoot = path.join(root, 'db-backup')
const safeOutput = audit.assertSafeAuditOutputDirectory(
  path.join(safeOutputRoot, 'audits', 'self-check-output-containment'),
  { isIgnored: () => true },
)
assert.equal(safeOutput.allowedRoot, safeOutputRoot)

const trackedReport = path.join(safeOutputRoot, 'audits', 'tracked-data-audit.json')
assert.throws(
  () => audit.assertSafeReportPath(trackedReport, {
    isIgnored: () => true,
    isTracked: (file) => file === trackedReport,
  }),
  /tracked audit report/,
)

const existingReport = path.join(safeOutputRoot, 'audits', 'self-check-existing-data-audit.json')
fs.mkdirSync(path.dirname(existingReport), { recursive: true })
fs.writeFileSync(existingReport, 'do not overwrite', 'utf8')
try {
  assert.throws(
    () => audit.assertSafeReportPath(existingReport, { isIgnored: () => true, isTracked: () => false }),
    /existing regular audit report/,
  )
} finally {
  fs.rmSync(existingReport, { force: true })
}

const outsideOutput = path.join(root, 'audit-output', 'not-db-backup')
assert.throws(
  () => audit.assertSafeAuditOutputDirectory(outsideOutput, { isIgnored: () => true }),
  /must be contained in ignored db-backup/,
)

const unignoredOutput = path.join(safeOutputRoot, 'audits', 'unignored')
assert.throws(
  () => audit.assertSafeAuditOutputDirectory(unignoredOutput, { isIgnored: (file) => file === safeOutputRoot }),
  /not ignored by Git/,
)

const linkTarget = path.join(os.tmpdir(), `hadith-audit-link-${process.pid}`)
const linkPath = path.join(safeOutputRoot, 'audits', `link-${process.pid}`)
try {
  fs.mkdirSync(path.dirname(linkPath), { recursive: true })
  try {
    fs.symlinkSync(linkTarget, linkPath, 'junction')
    assert.throws(
      () => audit.assertSafeAuditOutputDirectory(linkPath, { isIgnored: () => true }),
      /symlink or junction|not a directory/,
    )
  } catch (error) {
    if (error.code !== 'EPERM' && error.code !== 'EEXIST') throw error
  }
} finally {
  fs.rmSync(linkPath, { force: true, recursive: true })
  fs.rmSync(linkTarget, { force: true, recursive: true })
}

const redacted = audit.sanitizeMessage(
  'failed postgres://user:super-secret@example.com/db?sslmode=require DATABASE_URL=postgres://other:secret@host/db',
)
assert.ok(!redacted.includes('super-secret'))
assert.ok(!redacted.includes('other:secret'))
assert.match(redacted, /\[redacted database URL\]/)

const inherited = audit.inheritedDanglingReferences(manifest)
assert.equal(inherited.find((item) => item.area === 'quran_references').references, 423)
assert.equal(inherited.find((item) => item.area === 'controversy_trees').references, 22)
assert.equal(inherited.find((item) => item.area === 'narrator_relations').references, 6100)

console.log(`audit self-check passed: ${manifest.mappings.length} mappings, ${unknownMappings.length} required unknowns`)
