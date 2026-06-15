const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://postgres:bJmkMzZQLqhzYltMNDwentYAPFUAppSq@tramway.proxy.rlwy.net:39193/railway' });
async function main() {
  await client.connect();

  // 1. Full narrator_biography rows for narrator_id=3889 - show content truncated at 800 chars
  const bio = await client.query(`SELECT id, narrator_id, main_id, book_id, book_name, title, LEFT(content,800) as content_preview, LENGTH(content) as content_len FROM narrator_biography WHERE narrator_id=3889 LIMIT 5`);
  console.log('=== narrator_biography id=3889 ===');
  bio.rows.forEach((r,i) => { console.log('Row '+i+':'); console.log(JSON.stringify(r, null, 2)); });

  // 2. hadith_service_content columns
  const sc = await client.query(`SELECT column_name,data_type FROM information_schema.columns WHERE table_name='hadith_service_content' ORDER BY ordinal_position`);
  console.log('=== hadith_service_content columns ===');
  console.log(JSON.stringify(sc.rows, null, 2));

  // 3. hadith_service_types - show all rows
  const st = await client.query(`SELECT * FROM hadith_service_types ORDER BY id`);
  console.log('=== hadith_service_types all rows ===');
  console.log(JSON.stringify(st.rows, null, 2));

  // 4. hadith_services columns
  const hs = await client.query(`SELECT column_name,data_type FROM information_schema.columns WHERE table_name='hadith_services' ORDER BY ordinal_position`);
  console.log('=== hadith_services columns ===');
  console.log(JSON.stringify(hs.rows, null, 2));

  // 5. Count hadith_service_content
  const hsc = await client.query(`SELECT COUNT(*) FROM hadith_service_content`);
  console.log('=== hadith_service_content count ===');
  console.log(JSON.stringify(hsc.rows[0], null, 2));

  // 6. Sample 3 rows from hadith_service_content
  const hscSample = await client.query(`SELECT id, hadith_id, service_id, type_id, LEFT(content,400) as content_preview FROM hadith_service_content LIMIT 3`);
  console.log('=== hadith_service_content sample ===');
  console.log(JSON.stringify(hscSample.rows, null, 2));

  // 7. narratorid=3889 from narrators table - all columns
  const narr = await client.query(`SELECT * FROM narrators WHERE id=3889`);
  console.log('=== narrators WHERE id=3889 ===');
  console.log(JSON.stringify(narr.rows, null, 2));

  // 8. narrator_biography books breakdown for top 10 books
  const books = await client.query(`SELECT book_id, book_name, COUNT(*) as cnt FROM narrator_biography GROUP BY book_id, book_name ORDER BY cnt DESC LIMIT 10`);
  console.log('=== narrator_biography top 10 books ===');
  console.log(JSON.stringify(books.rows, null, 2));

  await client.end();
}
main().catch(console.error);
