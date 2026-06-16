import pg from 'pg'
const { Pool } = pg
const pool = new Pool({ connectionString: 'postgresql://postgres:bJmkMzZQLqhzYltMNDwentYAPFUAppSq@tramway.proxy.rlwy.net:39193/railway' })

// Exact query from service-books page
const { rows } = await pool.query(`
  SELECT b.id, b.title, b.takhrij_author, b.takhrij_death,
         COUNT(hsc.id)::int AS hadith_count
  FROM books b
  LEFT JOIN hadith_service_content hsc ON hsc.book_id = b.id
  WHERE b.id IN (SELECT DISTINCT book_id FROM hadith_service_content WHERE book_id IS NOT NULL)
  GROUP BY b.id, b.title, b.takhrij_author, b.takhrij_death
  ORDER BY hadith_count DESC
`)

console.log('Total books:', rows.length)
console.log('Bottom 10 (lowest count):')
rows.slice(-10).forEach(r => console.log(r.hadith_count, r.id, r.title.substring(0,50)))
console.log('\nAny with hadith_count = 0?', rows.filter(r => r.hadith_count === 0).map(r => r.title))
pool.end()
