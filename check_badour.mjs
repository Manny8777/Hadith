import pg from 'pg'
import dbenv from './db/dbenv.js'
const { Pool } = pg
const pool = new Pool({ connectionString: dbenv.url() })
const [a, b, c] = await Promise.all([
  pool.query("SELECT id, title FROM books WHERE title LIKE '%البدور%'"),
  pool.query("SELECT book_name, COUNT(*) as cnt FROM hadith_service_content WHERE book_name LIKE '%البدور%' GROUP BY book_name"),
  pool.query("SELECT book_id, COUNT(*) as cnt FROM hadith_service_content WHERE book_id IN (SELECT id FROM books WHERE title LIKE '%البدور%') GROUP BY book_id"),
])
console.log('books table:', a.rows)
console.log('hsc by book_name:', b.rows)
console.log('hsc by book_id:', c.rows)
pool.end()
