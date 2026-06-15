import pg from 'pg'
const { Pool } = pg
const pool = new Pool({ connectionString: 'postgresql://postgres:bJmkMzZQLqhzYltMNDwentYAPFUAppSq@tramway.proxy.rlwy.net:39193/railway' })

// hit say_ids for hadith 89841: 91459, 91460, 124947, 55532, 57904
// Are these IDs valid in hadith_judgments?
const r1 = await pool.query(`
  SELECT j.id, j.hadith_id, j.scientist_id, n.abb_name, LEFT(j.say_text, 100) as say_text_start
  FROM hadith_judgments j
  LEFT JOIN narrators n ON n.id = j.scientist_id
  WHERE j.id IN (91459, 91460, 124947, 55532, 57904)
`)
console.log('hit say_id judgment records:', JSON.stringify(r1.rows))

// Now check if the say_text of these hit judgment records CONTAINS the الدارقطني judgment text
// الدارقطني judgment 1 (id=155401): "ذكر أن الحسين بن عيسى تفرد"
// الدارقطني judgment 2 (id=155402): "الحسين بن عيسى تفرد ... منكر الحديث"
const r2 = await pool.query(`
  SELECT j.id, j.scientist_id, n.abb_name,
    (j.say_text LIKE '%ذكر أن الحسين%') as has_dq1,
    (j.say_text LIKE '%منكر الحديث%') as has_dq2,
    LEFT(j.say_text, 150) as say_start
  FROM hadith_judgments j
  LEFT JOIN narrators n ON n.id = j.scientist_id
  WHERE j.id IN (91459, 91460, 124947, 55532, 57904)
`)
console.log('do hit say_ids quote الدارقطني texts:', JSON.stringify(r2.rows))

// Also check: is there a column in hadith_judgment_hits or hadith_judgment_links
// that directly maps say_id → parent judgment somehow?
const r3 = await pool.query(`
  SELECT column_name, data_type FROM information_schema.columns
  WHERE table_name = 'hadith_judgment_hits'
  ORDER BY ordinal_position
`)
console.log('hadith_judgment_hits columns:', JSON.stringify(r3.rows.map(r => r.column_name)))

const r4 = await pool.query(`
  SELECT column_name, data_type FROM information_schema.columns
  WHERE table_name = 'hadith_judgment_links'
  ORDER BY ordinal_position
`)
console.log('hadith_judgment_links columns:', JSON.stringify(r4.rows.map(r => r.column_name)))

// Full row for each hit for hadith 89841
const r5 = await pool.query(`SELECT * FROM hadith_judgment_hits WHERE hadith_id = 89841`)
console.log('full hit rows:', JSON.stringify(r5.rows))

await pool.end()
