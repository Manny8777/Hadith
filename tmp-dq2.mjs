import pg from 'pg'
import dbenv from './db/dbenv.js'
const { Pool } = pg
const pool = new Pool({ connectionString: dbenv.url() })

// The two الدارقطني judgment texts for hadith 89841:
// 155401: "ذكر أن الحسين بن عيسى تفرد بهذا الحديث عن الحكم بن أبان"
// 155402: "الحسين بن عيسى تفرد بهذا الحديث عن الحكم بن أبان وحسين بن عيسى منكر الحديث قاله أبو حاتم وأبو زرعة الرازيان"

// Source nodes:
// عون المعبود: service_content id=361095
// نصب الراية:  service_content id=734540

// Check if first 15 chars of each text appear in each source
const r1 = await pool.query(`
  SELECT id, book_name,
    (content LIKE '%ذكر أن الحسين%') as has_j1_start,
    (content LIKE '%الحسين بن عيسى%') as has_j2_start,
    (content LIKE '%منكر الحديث قاله%') as has_j2_unique
  FROM hadith_service_content
  WHERE id IN (361095, 734540)
`)
console.log('text matches in sources:', JSON.stringify(r1.rows))

// Test the full LATERAL query with text matching for الدارقطني on hadith 89841
const r2 = await pool.query(`
  SELECT j.id, j.say_text,
    src.book_name, src.part_num, src.page_num, src.service_main_id,
    src.match_type
  FROM hadith_judgments j
  LEFT JOIN narrators n ON j.scientist_id = n.id
  LEFT JOIN LATERAL (
    SELECT hjl.service_main_id, hsc.book_name, hsc.part_num, hsc.page_num,
      CASE
        WHEN hsc.content LIKE '%' || LEFT(j.say_text, 15) || '%' THEN 'text'
        WHEN b.takhrij_death = n.death_year_num THEN 'death_year'
        ELSE 'ربط'
      END as match_type
    FROM hadith_judgment_hits jh
    JOIN hadith_judgment_links hjl ON hjl.say_id = jh.say_id AND hjl.is_book_toc = false
    JOIN hadith_service_content hsc ON hsc.id = hjl.service_main_id
    JOIN books b ON b.id = hsc.book_id
    WHERE jh.hadith_id = j.hadith_id
      AND (
        hsc.content LIKE '%' || LEFT(j.say_text, 15) || '%'
        OR b.takhrij_death = n.death_year_num
        OR hsc.content LIKE '%ربط="' || j.scientist_id::text || '"%'
      )
    ORDER BY
      CASE WHEN hsc.content LIKE '%' || LEFT(j.say_text, 15) || '%' THEN 0
           WHEN b.takhrij_death = n.death_year_num THEN 1
           ELSE 2 END
    LIMIT 1
  ) src ON true
  WHERE j.hadith_id = 89841
  ORDER BY n.death_year_num ASC NULLS LAST
`)

r2.rows.forEach(r => {
  console.log(`\nJudgment ${r.id}: ${r.say_text?.slice(0,50)}`)
  console.log(`  → ${r.book_name} (${r.part_num}/${r.page_num}) via ${r.match_type}`)
})

await pool.end()
