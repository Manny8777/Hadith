const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:bJmkMzZQLqhzYltMNDwentYAPFUAppSq@tramway.proxy.rlwy.net:39193/railway',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  // coverage: how many of 245 books have each field meaningfully populated
  const q = await pool.query(`
    SELECT
      COUNT(*) total,
      COUNT(NULLIF(TRIM(COALESCE(title,'')),'')) title,
      COUNT(NULLIF(TRIM(COALESCE(summary,'')),'')) summary,
      COUNT(NULLIF(TRIM(COALESCE(card_info,'')),'')) card_info,
      COUNT(author_id) author_id,
      COUNT(NULLIF(TRIM(COALESCE(takhrij_author,'')),'')) takhrij_author,
      COUNT(NULLIF(takhrij_death,0)) takhrij_death,
      COUNT(NULLIF(TRIM(COALESCE(takhrij_book,'')),'')) takhrij_book,
      COUNT(NULLIF(TRIM(COALESCE(print1_edition,'')),'')) print1_nonempty,
      COUNT(NULLIF(TRIM(COALESCE(print1_edition,'')),'0')) print1_not0,
      COUNT(NULLIF(TRIM(COALESCE(print2_edition,'')),'')) print2,
      COUNT(NULLIF(TRIM(COALESCE(part_page_edition,'')),'')) part_page,
      COUNT(mousanef_id) mousanef_id,
      COUNT(default_hadith) default_hadith,
      COUNT(NULLIF(strong,0)) strong_nonzero,
      COUNT(NULLIF(fame,0)) fame_nonzero,
      COUNT(NULLIF(tarteeb,0)) tarteeb_nonzero
    FROM books`);
  console.log('=== books field coverage (of 245) ===');
  for (const [k,v] of Object.entries(q.rows[0])) console.log('  ' + k.padEnd(22) + v);

  // show populated edition examples
  for (const col of ['print1_edition','print2_edition','part_page_edition','card_info','takhrij_book']) {
    const r = await pool.query(`SELECT title, ${col} AS v FROM books WHERE TRIM(COALESCE(${col},'')) NOT IN ('','0') LIMIT 5`).catch(e=>({error:e.message,rows:[]}));
    console.log(`\n--- ${col} examples (${r.rows.length}) ---`);
    if (r.error) console.log('  '+r.error);
    r.rows.forEach(x => console.log(`  [${(x.title||'').slice(0,30)}] ${String(x.v).slice(0,140)}`));
  }

  // takhrij author/death examples
  const t = await pool.query(`SELECT title, takhrij_author, takhrij_death, takhrij_book FROM books WHERE TRIM(COALESCE(takhrij_author,''))<>'' LIMIT 6`);
  console.log('\n--- takhrij (author/death/book) examples ---');
  t.rows.forEach(x=>console.log(`  [${(x.title||'').slice(0,28)}] author=${x.takhrij_author} death=${x.takhrij_death} book=${x.takhrij_book||''}`));

  // distinct value distributions for the small int flags
  for (const col of ['strong','fame','tarteeb']) {
    const d = await pool.query(`SELECT ${col} v, COUNT(*) c FROM books GROUP BY ${col} ORDER BY ${col}`);
    console.log(`\n--- ${col} distribution ---  ` + d.rows.map(r=>`${r.v}:${r.c}`).join('  '));
  }

  await pool.end();
}
main().catch(console.error);
