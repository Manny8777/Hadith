/**
 * Small, dependency-free fixture manifest for the API contract checks.
 *
 * The defaults are the stable records already used by the production smoke
 * runner. Override them for a different database/environment without changing
 * the test file, for example:
 *
 *   CONTRACT_HADITH_ID=123 CONTRACT_TOPIC_ID=456 node --test tests/contracts/api-contracts.test.mjs
 *
 * The BASE_URL check lives in the test runner rather than this manifest: a
 * missing server is a skipped prerequisite, not a fixture error.
 */

function firstEnv(...names) {
  for (const name of names) {
    const value = process.env[name]
    if (value !== undefined && value.trim() !== '') return value.trim()
  }
  return undefined
}

function positiveIntegerEnv(name, fallback) {
  const raw = firstEnv(name)
  if (raw === undefined) return fallback
  if (!/^\d+$/.test(raw)) return fallback
  const value = Number(raw)
  return Number.isSafeInteger(value) && value > 0 && value <= 2_147_483_647
    ? value
    : fallback
}

function timeoutEnv(name, fallback) {
  const raw = firstEnv(name)
  if (raw === undefined) return fallback
  const value = Number(raw)
  return Number.isSafeInteger(value) && value >= 1000 && value <= 120000
    ? value
    : fallback
}

function textEnv(name, fallback) {
  const raw = process.env[name]
  return raw === undefined ? fallback : raw
}

function invalidIdEnv(name, fallback) {
  const raw = firstEnv(name)
  // Reject anything the route's parseInt could accept, including signed/decimal
  // numeric text, so the fixture reliably exercises its invalid-ID branch.
  if (raw === undefined || /^[+-]?\d/.test(raw) || raw.includes('/')) return fallback
  return raw
}

export const contractFixtures = Object.freeze({
  // The smoke runner's representative hadith/commentary/topic/narrator IDs.
  hadithId: positiveIntegerEnv('CONTRACT_HADITH_ID', 5),
  commentaryHadithId: positiveIntegerEnv('CONTRACT_COMMENTARY_HADITH_ID', 7),
  topicId: positiveIntegerEnv('CONTRACT_TOPIC_ID', 759),
  narratorId: positiveIntegerEnv('CONTRACT_NARRATOR_ID', 9),

  // Search and empty-query coverage. A whitespace-only query exercises the
  // route's trimmed-empty branch without entering its wildcard search path.
  searchQuery: textEnv('CONTRACT_SEARCH_QUERY', 'الصلاة'),
  degenerateQuery: textEnv('CONTRACT_DEGENERATE_QUERY', ' '),
  emptyId: positiveIntegerEnv('CONTRACT_EMPTY_ID', 2147483647),
  invalidId: invalidIdEnv('CONTRACT_INVALID_ID', 'not-a-number'),

  timeoutMs: timeoutEnv('CONTRACT_TIMEOUT_MS', 15000),
})
