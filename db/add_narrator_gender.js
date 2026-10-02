// db/add_narrator_gender.js
//
// Why: the narrators table has no gender, so the site and the MCP server called every Companion
// «صحابي» — Aisha and Umm Salama included — and wrote of every narrator as "he". This stores:
//
//   narrators.is_female        derived once from the names (see FEMALE below)
//   narrators.companion_title  for Companions: «أم المؤمنين» for the Prophet's wives ﷺ,
//                              «صحابية» for the other women, «صحابي» for the men; NULL otherwise
//
// The rule, checked by hand against the matches: a male marker rules a narrator out (a kunya
// «أبو …», a name opening «أبو / ابن / بن»); otherwise any female marker rules her in — «بنت /
// ابنة» among the first words of the short name (the full name can mention a mother: «وأمه فلانة
// بنت …»), a name opening «أم / امرأة / جدة / عمة / خالة / أخت / مولاة …», «مولاة / زوج رسول الله
// / أخت …» right after the name, a kunya «أم …», a tabaqa «صحابية / لها صحبة / لها رؤية», a
// feminine grade («مقبولة», «مجهولة» …), or a woman's name standing alone. About 950 narrators.
// The Mothers of the Believers are listed by id.
//
// Additive (two new columns); re-run after importing narrators. Run: node db/add_narrator_gender.js
// Note: the database has standard_conforming_strings off, so the regexes use [[:space:]], not \s.

const fs = require('fs')
const path = require('path')
const { Pool } = require('pg')

function connectionString() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL
  const envPath = path.join(__dirname, '..', '.env')
  const env = fs.readFileSync(envPath, 'utf8')
  const m = env.match(/^\s*DATABASE_URL\s*=\s*"?([^"\r\n]+)"?\s*$/m)
  if (!m) throw new Error('DATABASE_URL not found in environment or ' + envPath)
  return m[1]
}

// خديجة، سودة، عائشة، حفصة، زينب بنت خزيمة، أم سلمة، زينب بنت جحش، جويرية، أم حبيبة، صفية، ميمونة
const MOTHERS_OF_THE_BELIEVERS = [15205, 2700, 3026, 1565, 15947, 6741, 2214, 1193, 2020, 2917, 6480]

const SP = '[[:space:]]'
const WORD = '[^[:space:]]+'
const WOMEN_NAMES = [
  'فاطمة', 'عائشة', 'زينب', 'حفصة', 'ميمونة', 'صفية', 'جويرية', 'رملة', 'سودة', 'خديجة', 'أمامة',
  'رقية', 'سمية', 'عمرة', 'حبيبة', 'حمنة', 'سهلة', 'نسيبة', 'الخنساء', 'خنساء', 'ليلى', 'سلمى',
  'أميمة', 'بريرة', 'فاختة', 'حكيمة', 'مسيكة', 'معاذة', 'كبشة', 'قيلة', 'جدامة', 'سبيعة', 'الرباب',
  'بسرة', 'الفريعة', 'خيرة', 'ندبة', 'عائذة', 'حميدة', 'كريمة', 'مريم', 'آمنة', 'حواء', 'رميثة',
  'بهيسة', 'بهية', 'لؤلؤة', 'بنانة', 'أنيسة', 'صميتة', 'رفيدة', 'سائبة',
].join('|')

const FEMALE = `(
  NOT (coalesce(kunia, '') ~ '^${SP}*أبو${SP}' OR abb_name ~ '^(أبو|ابن|بن)${SP}')
  AND (
       abb_name ~ '^(${WORD}${SP}+){1,2}(بنت|ابنة)${SP}'
    OR abb_name ~ '^(بنت|ابنة|أم|امرأة|جدة|جدته|عمة|عمته|خالة|خالته|أخت|أخته|أمه|ابنته|مولاة|زوجة|امرأته)(${SP}|$)'
    OR abb_name ~ '^${WORD}(${SP}+${WORD})?${SP}+(مولاة|امرأة|زوج رسول الله|زوج النبي|أخت|عمة|خالة|جدة)${SP}'
    OR coalesce(kunia, '') ~ '^${SP}*(قيل : )?أم${SP}'
    OR coalesce(tabaqa, '') ~ '(صحابية|لها صحبة|لها رؤية)'
    OR coalesce(martaba_ibn_hajar, '') ~ '^(مقبولة|ثقة مأمونة|صحابية|لا تعرف|مجهولة)'
    OR (abb_name ~ '^(${WOMEN_NAMES})(${SP}|$)' AND abb_name !~ '^${WORD}${SP}+(بن|ابن)${SP}')
  )
)`

async function main() {
  const pool = new Pool({ connectionString: connectionString(), ssl: { rejectUnauthorized: false } })
  await pool.query(`ALTER TABLE narrators ADD COLUMN IF NOT EXISTS is_female boolean NOT NULL DEFAULT false`)
  await pool.query(`ALTER TABLE narrators ADD COLUMN IF NOT EXISTS companion_title text`)
  const f = await pool.query(`UPDATE narrators SET is_female = ${FEMALE} OR id = ANY($1::int[])`, [MOTHERS_OF_THE_BELIEVERS])
  const t = await pool.query(
    `UPDATE narrators SET companion_title = CASE
       WHEN id = ANY($1::int[]) THEN 'أم المؤمنين'
       WHEN NOT is_companion THEN NULL
       WHEN is_female THEN 'صحابية'
       ELSE 'صحابي' END`, [MOTHERS_OF_THE_BELIEVERS])
  const { rows } = await pool.query(
    `SELECT COUNT(*) FILTER (WHERE is_female)::int AS women, companion_title, COUNT(*)::int AS n
     FROM narrators GROUP BY ROLLUP (companion_title) ORDER BY companion_title NULLS LAST`)
  console.log(`updated ${f.rowCount} / ${t.rowCount} rows`)
  console.table(rows)
  await pool.end()
}

main().catch(e => { console.error(e); process.exit(1) })
