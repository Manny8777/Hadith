import pg from 'pg'
import dbenv from './db/dbenv.js'
const { Pool } = pg
const pool = new Pool({ connectionString: dbenv.url() })

const HADITH_ID = 89841

// New sources query
const src = await pool.query(`
  SELECT DISTINCT ON (n.id, hjl.service_main_id)
         n.id as scientist_id,
         n.abb_name,
         hjl.service_main_id, hsc.book_name, hsc.part_num, hsc.page_num
  FROM (SELECT DISTINCT j.scientist_id FROM hadith_judgments j WHERE j.hadith_id = $1 AND j.scientist_id IS NOT NULL) jd
  JOIN narrators n ON n.id = jd.scientist_id
  JOIN hadith_judgment_hits jh ON jh.hadith_id = $1
  JOIN hadith_judgment_links hjl ON hjl.say_id = jh.say_id AND hjl.is_book_toc = false
  JOIN hadith_service_content hsc ON hsc.id = hjl.service_main_id
  JOIN books b ON b.id = hsc.book_id
  WHERE (b.takhrij_death = n.death_year_num
         OR hsc.content LIKE '%ربط="' || n.id::text || '"%')
  ORDER BY n.id, hjl.service_main_id
`, [HADITH_ID])

console.log('Sources per scientist:')
for (const r of src.rows) {
  console.log(`  sci=${r.scientist_id}(${r.abb_name}) → ${r.book_name} (${r.part_num}/${r.page_num}) [id=${r.service_main_id}]`)
}

// Simulate the cycling assignment
const judgments = await pool.query(`
  SELECT j.say_text, j.scientist_id, n.abb_name, n.death_year_num
  FROM hadith_judgments j
  LEFT JOIN narrators n ON j.scientist_id = n.id
  WHERE j.hadith_id = $1
  ORDER BY n.death_year_num ASC NULLS LAST
  LIMIT 30
`, [HADITH_ID])

const sourcesMap = new Map()
for (const r of src.rows) {
  const k = Number(r.scientist_id)
  if (!sourcesMap.has(k)) sourcesMap.set(k, [])
  sourcesMap.get(k).push(r)
}
const srcCursor = new Map()

console.log('\nFinal judgment→source assignments:')
for (const j of judgments.rows) {
  const sciId = j.scientist_id != null ? Number(j.scientist_id) : null
  let chosen = null
  if (sciId != null) {
    const srcs = sourcesMap.get(sciId) || []
    const idx = srcCursor.get(sciId) ?? 0
    chosen = srcs[idx] ?? srcs[0] ?? null
    srcCursor.set(sciId, idx + 1)
  }
  console.log(`  [${j.abb_name}] ${j.say_text?.slice(0,50)}`)
  console.log(`    → ${chosen ? `${chosen.book_name} (${chosen.part_num}/${chosen.page_num})` : 'no source'}`)
}

await pool.end()
