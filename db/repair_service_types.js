// db/repair_service_types.js
//
// Restore the IDs from the legacy HadithsServicesTypes table.
// The source IDs are deliberately sparse: 1..12, then 15..17.
// In particular, شبهات is source type 15; it is not a hadith_services flag.

const dbenv = require('./dbenv')
const { Pool } = require('pg')

const SOURCE_TYPES = [
  { id: 1, name: 'استدلال فقهي', columnKey: 'feqh' },
  { id: 2, name: 'الإدراج', columnKey: 'modrag' },
  { id: 3, name: 'الطب النبوي', columnKey: 'medicine' },
  { id: 4, name: 'أمثال الحديث', columnKey: 'amthal' },
  { id: 5, name: 'التواتر', columnKey: 'motawater' },
  { id: 6, name: 'الشروح', columnKey: 'sharh' },
  { id: 7, name: 'أسباب الورود', columnKey: 'asbab' },
  { id: 8, name: 'تخريج كتب التخريج والعلل', columnKey: 'takhreg' },
  { id: 9, name: 'تخريج رواة', columnKey: 'rwah' },
  { id: 10, name: 'تخريج شروح', columnKey: 'compound_matn' },
  { id: 11, name: 'أصل', columnKey: 'asnad' },
  { id: 12, name: 'مخالف', columnKey: 'mokhtalaf' },
  { id: 15, name: 'شبهات', columnKey: null },
  { id: 16, name: 'تفسير بالمأثور', columnKey: 'tafsser' },
  { id: 17, name: 'سيرة', columnKey: 'biography' },
]

function normalize(row) {
  return {
    id: Number(row.id),
    name: row.name,
    column_key: row.column_key == null ? null : row.column_key,
  }
}

function expected() {
  return SOURCE_TYPES.map(t => ({
    id: t.id,
    name: t.name,
    column_key: t.columnKey,
  }))
}

function sameTypes(rows) {
  const actual = rows.map(normalize)
  const want = expected()
  return actual.length === want.length && actual.every((row, i) =>
    row.id === want[i].id && row.name === want[i].name && row.column_key === want[i].column_key
  )
}

async function readCurrent(client) {
  const { rows } = await client.query(
    'SELECT id, name, column_key FROM hadith_service_types ORDER BY id'
  )
  return rows.map(normalize)
}

async function main() {
  const checkOnly = process.argv.includes('--check')
  const pool = new Pool({
    connectionString: dbenv.url(),
    ssl: { rejectUnauthorized: false },
    max: 1,
  })
  const client = await pool.connect()

  try {
    const current = await readCurrent(client)
    if (checkOnly) {
      const ok = sameTypes(current)
      console.log(JSON.stringify({ ok, current, expected: expected() }, null, 2))
      if (!ok) process.exitCode = 1
      return
    }

    await client.query('BEGIN')
    await client.query('SET LOCAL lock_timeout = \'10s\'')
    await client.query('SET LOCAL statement_timeout = \'30s\'')

    const unknown = await client.query(
      `SELECT type_id, count(*)::int AS rows
         FROM hadith_service_links
        WHERE type_id IS NOT NULL
          AND type_id <> ALL($1::smallint[])
        GROUP BY type_id
        ORDER BY type_id`,
      [SOURCE_TYPES.map(t => t.id)]
    )
    if (unknown.rows.length > 0) {
      throw new Error(`unknown linked service type IDs: ${JSON.stringify(unknown.rows)}`)
    }

    const sourceIds = SOURCE_TYPES.map(t => t.id)
    await client.query(
      `DELETE FROM hadith_service_types
        WHERE id <> ALL($1::smallint[])`,
      [sourceIds]
    )

    for (const type of SOURCE_TYPES) {
      await client.query(
        `INSERT INTO hadith_service_types (id, name, column_key)
         VALUES ($1, $2, $3)
         ON CONFLICT (id) DO UPDATE
           SET name = EXCLUDED.name,
               column_key = EXCLUDED.column_key`,
        [type.id, type.name, type.columnKey]
      )
    }

    const repaired = await readCurrent(client)
    if (!sameTypes(repaired)) {
      throw new Error('post-repair verification failed')
    }

    await client.query('COMMIT')
    console.log(JSON.stringify({
      repaired: true,
      rows: repaired.length,
      types: repaired,
      note: 'Restored sparse legacy HadithsServicesTypes IDs; no hadith_services boolean was invented for شبهات.',
    }, null, 2))
  } catch (error) {
    try { await client.query('ROLLBACK') } catch { /* connection may already be closed */ }
    throw error
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((error) => {
  console.error('FAILED:', error.message)
  process.exitCode = 1
})
