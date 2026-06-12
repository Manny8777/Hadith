const { Pool } = require('pg');
const p = new Pool({ connectionString: 'postgresql://postgres:bJmkMzZQLqhzYltMNDwentYAPFUAppSq@tramway.proxy.rlwy.net:39193/railway', ssl: { rejectUnauthorized: false } });

async function run() {
  // Find Al-Bukhari
  const bukhari = await p.query(`SELECT id, name FROM narrators WHERE name ILIKE '%البخاري%' LIMIT 5`);
  console.log('Bukhari candidates:', JSON.stringify(bukhari.rows));

  if (bukhari.rows.length > 0) {
    const id = bukhari.rows[0].id;
    console.log('\nUsing narrator id:', id, bukhari.rows[0].name);

    // Who appear as his teachers (second_id = id, is_sheikh = true → first_id are teachers)
    const teachers = await p.query(`
      SELECT n.id, n.name FROM narrator_relations nr
      JOIN narrators n ON n.id = nr.first_id
      WHERE nr.second_id = $1 AND nr.is_sheikh = true LIMIT 10`, [id]);
    console.log('\nTeachers (second_id=X, first_id=teacher):', JSON.stringify(teachers.rows));

    // Who appear as his students (first_id = id, is_sheikh = true → second_id are students)
    const students = await p.query(`
      SELECT n.id, n.name FROM narrator_relations nr
      JOIN narrators n ON n.id = nr.second_id
      WHERE nr.first_id = $1 AND nr.is_sheikh = true LIMIT 10`, [id]);
    console.log('\nStudents (first_id=X, second_id=student):', JSON.stringify(students.rows));

    // Also check is_sheikh=false
    const rel_false = await p.query(`
      SELECT nr.first_id, nr.second_id, nr.is_sheikh, n1.name as n1, n2.name as n2
      FROM narrator_relations nr
      JOIN narrators n1 ON n1.id = nr.first_id
      JOIN narrators n2 ON n2.id = nr.second_id
      WHERE (nr.first_id = $1 OR nr.second_id = $1) LIMIT 20`, [id]);
    console.log('\nAll relations for this narrator:', JSON.stringify(rel_false.rows));
  }

  await p.end();
}
run().catch(e => { console.error(e.message); p.end(); });
