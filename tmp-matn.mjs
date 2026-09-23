import pg from 'pg'
import dbenv from './db/dbenv.js'
const { Pool } = pg
const pool = new Pool({ connectionString: dbenv.url() })

const HADITH_ID = 89844

// Get group
const grp = await pool.query(`SELECT group_id FROM takhrij WHERE hadith_id = $1 LIMIT 1`, [HADITH_ID])
const groupId = grp.rows[0]?.group_id
console.log('groupId:', groupId)

// Get all hadiths in group with content
const res = await pool.query(`
  SELECT t.hadith_id, b.title as book_title, b.takhrij_death,
         h.tarf, LEFT(h.content, 300) as content_preview, h.content IS NOT NULL as has_content
  FROM takhrij t
  JOIN hadith_toc h ON h.main_id = t.hadith_id
  JOIN books b ON b.id = t.book_id
  WHERE t.group_id = $1
  ORDER BY b.strong ASC NULLS LAST, t.hadith_id
  LIMIT 20
`, [groupId])

console.log(`\n${res.rows.length} hadiths in group:`)
res.rows.forEach(r => {
  console.log(`\n  id=${r.hadith_id} book="${r.book_title}" death=${r.takhrij_death} has_content=${r.has_content}`)
  console.log(`  tarf: ${(r.tarf||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim().slice(0,100)}`)
  if (r.content_preview) {
    console.log(`  content: ${r.content_preview.slice(0,150)}`)
  }
})

// Get the actual current hadith content
const cur = await pool.query(`SELECT content FROM hadith_toc WHERE main_id = $1`, [HADITH_ID])
console.log('\n\nCurrent hadith content (first 500):')
console.log(cur.rows[0]?.content?.slice(0, 500))

await pool.end()
