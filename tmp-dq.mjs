import pg from 'pg'
import dbenv from './db/dbenv.js'
const { Pool } = pg
const pool = new Pool({ connectionString: dbenv.url() })

// الدارقطني = scientist_id 12982
// What are the hadith_judgments rows for hadith 89841?
const r1 = await pool.query(`
  SELECT j.id, j.scientist_id, n.abb_name, j.say_text
  FROM hadith_judgments j
  LEFT JOIN narrators n ON n.id = j.scientist_id
  WHERE j.hadith_id = 89841
  ORDER BY n.death_year_num ASC NULLS LAST
`)
console.log('judgments:', JSON.stringify(r1.rows.map(r => ({id: r.id, sci: r.scientist_id, name: r.abb_name, t: r.say_text?.slice(0,60)}))))

// What are the hadith_judgment_hits rows for hadith 89841?
const r2 = await pool.query(`
  SELECT jh.say_id,
         jl.service_main_id, jl.is_book_toc,
         hsc.book_name, hsc.part_num, hsc.page_num,
         j2.scientist_id, n2.abb_name as hit_scientist
  FROM hadith_judgment_hits jh
  LEFT JOIN hadith_judgment_links jl ON jl.say_id = jh.say_id AND jl.is_book_toc = false
  LEFT JOIN hadith_service_content hsc ON hsc.id = jl.service_main_id
  LEFT JOIN hadith_judgments j2 ON j2.id = jh.say_id
  LEFT JOIN narrators n2 ON n2.id = j2.scientist_id
  WHERE jh.hadith_id = 89841
`)
console.log('hits:', JSON.stringify(r2.rows))

// Key question: do any hit say_ids EQUAL the judgment ids?
const judIds = r1.rows.map(r => r.id)
const r3 = await pool.query(`SELECT say_id FROM hadith_judgment_hits WHERE hadith_id=89841 AND say_id = ANY($1)`, [judIds])
console.log('hit say_ids that match judgment ids:', JSON.stringify(r3.rows))

// Check the say_text of الدارقطني judgments vs what the source content says
// Get first 50 chars of each judgment text
const daraqIDs = r1.rows.filter(r => r.scientist_id == 12982).map(r => r.id)
console.log('الدارقطني judgment ids:', daraqIDs)
console.log('الدارقطني texts:', r1.rows.filter(r => r.scientist_id == 12982).map(r => r.say_text?.slice(0,80)))

await pool.end()
