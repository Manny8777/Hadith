// Answers saved ahead of time for the heaviest queries. The data on the device never changes, so a
// query's rows are the same every time; the analysis pages whose queries take seconds or minutes on
// a phone have them computed once, when the offline database is built
// (scripts/offline/build-query-cache.mjs), and stored in the table offline_query_cache.
import type { QueryResult } from './shims/db'

type Runner = (text: string, params?: unknown[]) => Promise<QueryResult>

export const cacheParams = (params?: unknown[]) => JSON.stringify(params ?? [])

// Dates do not survive JSON as they are: tagged on the way in, rebuilt on the way out
export const encodeRows = (rows: unknown[]) =>
  JSON.stringify(rows, function (k, v) { const o = (this as Record<string, unknown>)[k]; return o instanceof Date ? { $date: o.toISOString() } : v })
export const decodeRows = (json: string) =>
  JSON.parse(json, (_k, v) => (v && typeof v === 'object' && typeof v.$date === 'string' && Object.keys(v).length === 1 ? new Date(v.$date) : v))

export function withQueryCache(run: Runner): Runner {
  let saved: Promise<Set<string>> | null = null
  const keys = () => (saved ??= run('SELECT sql, params FROM offline_query_cache')
    .then(r => new Set(r.rows.map((x: { sql: string; params: string }) => x.sql + '\0' + x.params)), () => new Set<string>()))
  return async (text, params) => {
    const p = cacheParams(params)
    if ((await keys()).has(text + '\0' + p)) {
      const r = await run('SELECT rows FROM offline_query_cache WHERE key = md5($2 || $1)', [text, p])
      if (r.rows[0]) { const rows = decodeRows(r.rows[0].rows); return { rows, rowCount: rows.length, fields: [] } }
    }
    return run(text, params)
  }
}
