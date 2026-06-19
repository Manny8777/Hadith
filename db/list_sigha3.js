const { Pool } = require('pg');
const fs = require('fs');
const pool = new Pool({
  connectionString: 'postgresql://postgres:bJmkMzZQLqhzYltMNDwentYAPFUAppSq@tramway.proxy.rlwy.net:39193/railway',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  // term id -> text
  const t = await pool.query(`SELECT id, text FROM isnad_tahdeth_types`);
  const txt = {};
  t.rows.forEach(r => txt[r.id] = r.text);

  // count how many chains reference each tahdeth row
  const usePerTahdeth = {};
  const ih = await pool.query(`SELECT sanad_tahdeth_id, COUNT(*) c FROM isnad_hadiths WHERE sanad_tahdeth_id IS NOT NULL GROUP BY sanad_tahdeth_id`);
  ih.rows.forEach(r => usePerTahdeth[r.sanad_tahdeth_id] = Number(r.c));

  // stream all sand_tahdeth
  const counts = {};        // term_id -> number of narrator-links using it (weighted by chain usage)
  const linkCounts = {};    // term_id -> raw link occurrences (unweighted, per distinct chain row)
  let processed = 0;
  const batch = 5000;
  let offset = 0;
  while (true) {
    const { rows } = await pool.query(`SELECT id, sand_tahdeth FROM isnad_tahdeth ORDER BY id LIMIT ${batch} OFFSET ${offset}`);
    if (rows.length === 0) break;
    for (const r of rows) {
      const weight = usePerTahdeth[r.id] || 0;
      const segs = (r.sand_tahdeth || '').trim().split('$');
      for (const seg of segs) {
        const parts = seg.trim().split(/\s+/);
        // each seg = "narratorId termId" ; last seg may be just "narratorId"
        if (parts.length >= 2) {
          const termId = parseInt(parts[1]);
          if (!isNaN(termId)) {
            linkCounts[termId] = (linkCounts[termId] || 0) + 1;
            counts[termId] = (counts[termId] || 0) + weight;
          }
        }
      }
    }
    processed += rows.length;
    offset += batch;
  }

  const ids = Object.keys(linkCounts).map(Number).sort((a,b)=> (counts[b]-counts[a]) || (linkCounts[b]-linkCounts[a]));
  console.log('distinct isnad_tahdeth rows processed:', processed);
  console.log('distinct term IDs actually used between narrators:', ids.length);
  console.log('\nrank | id | linkOccurrences | weightedByChainUse | text');
  let out = 'id\ttext\tlink_occurrences\tweighted_chain_uses\n';
  ids.forEach((id,i) => {
    const line = `${String(i+1).padStart(3)} | ${String(id).padStart(4)} | ${String(linkCounts[id]).padStart(9)} | ${String(counts[id]).padStart(10)} | ${txt[id] ?? '??'}`;
    console.log(line);
    out += `${id}\t${(txt[id]??'??')}\t${linkCounts[id]}\t${counts[id]}\n`;
  });
  fs.writeFileSync('db/sigha_used.tsv', out, 'utf8');
  console.log('\nwrote db/sigha_used.tsv');

  await pool.end();
}
main().catch(console.error);
