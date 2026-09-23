import pg from 'pg'
import dbenv from './db/dbenv.js'
const { Pool } = pg
const pool = new Pool({ connectionString: dbenv.url() })

const HADITH_ID = 89844

function stripXml(xml) {
  return (xml || '')
    .replace(/<سند_مخفي[\s\S]*?<\/سند_مخفي>/g, '')
    .replace(/<رقم_حديث[^>]*>[^<]*<\/رقم_حديث>/g, '')
    .replace(/<رقم_الفقرة[^>]*\/>/g, '')
    .replace(/<الصفحات[^>]*\/>/g, '')
    .replace(/<نه\/>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ')
    .replace(/^\s*[-–—]\s*/, '')
    .replace(/\s+/g, ' ').trim()
}

// Extract just the matn: remove the isnad part (narrators) and leave the actual speech
// The isnad typically ends with "قَالَ" or "أَنَّ" and similar connectors
// But let's first see what clean text looks like

const grp = await pool.query(`SELECT group_id FROM takhrij WHERE hadith_id = $1 LIMIT 1`, [HADITH_ID])
const groupId = grp.rows[0]?.group_id

const res = await pool.query(`
  SELECT t.hadith_id, b.title as book_title, b.strong,
         h.tarf, h.content
  FROM takhrij t
  JOIN hadith_toc h ON h.main_id = t.hadith_id
  JOIN books b ON b.id = t.book_id
  WHERE t.group_id = $1
    AND h.content IS NOT NULL
  ORDER BY b.strong ASC NULLS LAST, t.hadith_id
  LIMIT 10
`, [groupId])

console.log(`Group ${groupId} - ${res.rows.length} hadiths\n`)

// Show the tarf for each (this is the matn beginning, stripped)
for (const r of res.rows) {
  const tarf = stripXml(r.tarf || '')
  console.log(`[${r.book_title} strong=${r.strong}]`)
  console.log(`  tarf: ${tarf.slice(0, 200)}`)
  console.log()
}

// Now look at just the tarf column values (raw XML) for a few to understand structure
const tarfSamples = await pool.query(`
  SELECT t.hadith_id, b.title, h.tarf
  FROM takhrij t
  JOIN hadith_toc h ON h.main_id = t.hadith_id
  JOIN books b ON b.id = t.book_id
  WHERE t.group_id = $1
  LIMIT 5
`, [groupId])

console.log('\n--- Raw tarf samples ---')
for (const r of tarfSamples.rows) {
  console.log(`\n[${r.hadith_id}] ${r.title}:`)
  console.log(r.tarf?.slice(0, 400) || 'NULL')
}

// Also check a small group to test variant comparison
const smallGroup = await pool.query(`
  SELECT group_id, COUNT(*) as cnt
  FROM takhrij
  GROUP BY group_id
  HAVING COUNT(*) BETWEEN 3 AND 8
  ORDER BY RANDOM()
  LIMIT 1
`)
const smallGroupId = smallGroup.rows[0]?.group_id
if (smallGroupId) {
  console.log('\n\n--- Small group for testing ---')
  const sg = await pool.query(`
    SELECT t.hadith_id, b.title, h.tarf
    FROM takhrij t
    JOIN hadith_toc h ON h.main_id = t.hadith_id
    JOIN books b ON b.id = t.book_id
    WHERE t.group_id = $1
    ORDER BY b.strong ASC NULLS LAST
  `, [smallGroupId])
  sg.rows.forEach(r => {
    const clean = stripXml(r.tarf || '').slice(0, 200)
    console.log(`  [${r.book_title}]: ${clean}`)
  })
}

await pool.end()
