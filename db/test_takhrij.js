const { Pool } = require('pg');
const pool = new Pool({
  connectionString: require('./dbenv.js').url(),
  ssl: { rejectUnauthorized: false }
});

pool.query('SELECT hadith_id, group_id FROM takhrij WHERE group_id IN (SELECT group_id FROM takhrij GROUP BY group_id HAVING COUNT(*) > 3) LIMIT 1')
  .then(r => {
    const { hadith_id, group_id } = r.rows[0];
    console.log('Test hadith_id:', hadith_id, 'group_id:', group_id);
    return pool.query(
      `SELECT t.hadith_id AS main_id, t.book_id, h.book_name, b.title AS book_title, h.tarf, h.part_num, h.page_num
       FROM takhrij t
       JOIN hadith_toc h ON h.main_id = t.hadith_id
       JOIN books b ON b.id = t.book_id
       WHERE t.group_id = $1 AND t.hadith_id != $2
       ORDER BY t.book_id, t.hadith_id LIMIT 5`,
      [group_id, hadith_id]
    );
  })
  .then(r => {
    console.log('Takhrij results (' + r.rows.length + ' rows):');
    r.rows.forEach(row => console.log(' -', row.main_id, '|', row.book_title, '|', (row.tarf || '').substring(0, 60)));
    pool.end();
  })
  .catch(e => { console.error(e.message); pool.end(); process.exit(1); });
