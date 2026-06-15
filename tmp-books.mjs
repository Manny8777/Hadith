import pg from 'pg'
const { Pool } = pg
const pool = new Pool({ connectionString: 'postgresql://postgres:bJmkMzZQLqhzYltMNDwentYAPFUAppSq@tramway.proxy.rlwy.net:39193/railway' })

// Check books table columns
const r1 = await pool.query(`
  SELECT column_name, data_type FROM information_schema.columns
  WHERE table_name = 'books' ORDER BY ordinal_position
`)
console.log('books columns:', r1.rows.map(r => `${r.column_name}(${r.data_type})`).join(', '))

// Sample books for hadith 89844 takhrij group
const r2 = await pool.query(`
  SELECT b.id, b.title, b.takhrij_author, b.takhrij_death,
         COUNT(t.hadith_id) as hadith_count
  FROM takhrij t
  JOIN books b ON b.id = t.book_id
  WHERE t.group_id = (SELECT group_id FROM takhrij WHERE hadith_id = 89844 LIMIT 1)
  GROUP BY b.id, b.title, b.takhrij_author, b.takhrij_death
  ORDER BY b.takhrij_death ASC NULLS LAST
`)
console.log('\nBooks for hadith 89844 group:')
r2.rows.forEach(r => console.log(`  id=${r.id} title="${r.title}" author="${r.takhrij_author}" death=${r.takhrij_death} hadiths=${r.hadith_count}`))

// Check all columns with sample values for the first 3 books
const bookIds = r2.rows.slice(0, 3).map(r => r.id)
const r3 = await pool.query(`SELECT * FROM books WHERE id = ANY($1)`, [bookIds])
console.log('\nFull book row sample:')
r3.rows.forEach(r => console.log(JSON.stringify(r)))

await pool.end()
