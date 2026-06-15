const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:bJmkMzZQLqhzYltMNDwentYAPFUAppSq@tramway.proxy.rlwy.net:39193/railway',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  const { rows } = await pool.query(`
    SELECT b.id, b.title, b.takhrij_author, b.takhrij_death, b.fame, b.tarteeb,
           COUNT(h.main_id)::int as hadith_count
    FROM books b
    LEFT JOIN hadith_toc h ON h.book_id = b.id AND h.is_leaf = true AND h.is_paragraph = true
    GROUP BY b.id, b.title, b.takhrij_author, b.takhrij_death, b.fame, b.tarteeb
    ORDER BY b.tarteeb, hadith_count DESC
  `);
  rows.forEach(r => console.log(`  [${r.id}] ${r.title} (${r.takhrij_author}, ت${r.takhrij_death}) fame=${r.fame} count=${r.hadith_count}`));
  await pool.end();
}
main().catch(console.error);
