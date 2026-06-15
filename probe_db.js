const {Client} = require('pg');
const c = new Client({
  connectionString: 'postgresql://postgres:bJmkMzZQLqhzYltMNDwentYAPFUAppSq@tramway.proxy.rlwy.net:39193/railway',
  ssl: {rejectUnauthorized: false}
});

async function run() {
  await c.connect();

  // 1. narrator_grading sort range
  let r = await c.query('SELECT DISTINCT sort FROM narrator_grading ORDER BY sort');
  console.log('narrator_grading sort values:', JSON.stringify(r.rows));

  // 2. narrator_grading_terms sort_order range
  r = await c.query('SELECT DISTINCT sort_order FROM narrator_grading_terms ORDER BY sort_order');
  console.log('narrator_grading_terms sort_order:', JSON.stringify(r.rows));

  // 3. narrators with martaba values
  r = await c.query("SELECT id, name, martaba_ibn_hajar, martaba_zahabi, laqab, selat_karaba, death_year_num FROM narrators WHERE martaba_ibn_hajar != '' LIMIT 5");
  console.log('narrators with martaba_ibn_hajar:', JSON.stringify(r.rows));

  // 4. matn_dates
  r = await c.query('SELECT * FROM matn_dates LIMIT 5');
  console.log('matn_dates:', JSON.stringify(r.rows));

  // 5. hadith_judgment_hits
  r = await c.query('SELECT * FROM hadith_judgment_hits LIMIT 5');
  console.log('hadith_judgment_hits:', JSON.stringify(r.rows));

  // 6. hadith_judgments
  r = await c.query('SELECT * FROM hadith_judgments LIMIT 5');
  console.log('hadith_judgments:', JSON.stringify(r.rows));

  // 7. amthal
  r = await c.query('SELECT * FROM amthal LIMIT 3');
  console.log('amthal:', JSON.stringify(r.rows));

  // 8. gwamh
  r = await c.query('SELECT * FROM gwamh LIMIT 3');
  console.log('gwamh:', JSON.stringify(r.rows));

  // 9. gwamh_items
  r = await c.query('SELECT * FROM gwamh_items LIMIT 3');
  console.log('gwamh_items:', JSON.stringify(r.rows));

  // 10. matn_comparison
  r = await c.query('SELECT * FROM matn_comparison LIMIT 3');
  console.log('matn_comparison:', JSON.stringify(r.rows));

  await c.end();
}

run().catch(e => { console.error(e); process.exit(1); });
