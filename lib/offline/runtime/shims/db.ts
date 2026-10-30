// '@/lib/db' in the offline build: the same pool.query() the pages call on the server, answered by
// the copy of the database on the device (PGlite, real PostgreSQL) instead of the server's.
export interface QueryResult<T = any> { rows: T[]; rowCount: number; fields?: unknown[] }
type Runner = (text: string, params?: unknown[]) => Promise<QueryResult>

let runner: Runner | null = null
export function setOfflineRunner(r: Runner) { runner = r }

async function query<T = any>(text: string | { text: string; values?: unknown[] }, params?: unknown[]): Promise<QueryResult<T>> {
  if (!runner) throw new Error('offline database not open')
  if (typeof text === 'object') return runner(text.text, text.values ?? params) as Promise<QueryResult<T>>
  return runner(text, params) as Promise<QueryResult<T>>
}

const client = { query, release() {} }
const pool = {
  query,
  async connect() { return client },
  on() { return pool },
  end: async () => {},
}
export default pool
