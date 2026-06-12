// Migrate narrator biography entries from BookTOC_Services via NounsTranslation
// NounsTranslation: f0=NounID (narrator_id), f1=ServiceMainID (BookTOC_Services.f0/MainID)
// BookTOC_Services: f0=MainID, f1=BookID, f2=BookName, f4=content (with XML), f17=title
// Strategy: load NounsTranslation to build needed MainID set, then stream BookTOC_Services

const fs = require('fs');
const readline = require('readline');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres:bJmkMzZQLqhzYltMNDwentYAPFUAppSq@tramway.proxy.rlwy.net:39193/railway',
  ssl: { rejectUnauthorized: false }
});

const DATA = String.raw`C:\HadithProg\railway\extract\data`;

// Strip Harf XML markup tags, keep only text content
function stripXml(text) {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(/<[^>]+>/g, ' ')      // remove XML tags
    .replace(/\s+/g, ' ')          // normalize whitespace
    .trim();
}

async function run() {
  const client = await pool.connect();
  try {
    // Apply schema
    const schema = fs.readFileSync(
      path.join(__dirname, 'schema_narrator_biography.sql'), 'utf8');
    await client.query(schema);
    console.log('Schema applied.');

    // Load NounsTranslation
    console.log('Loading NounsTranslation...');
    const nt = JSON.parse(fs.readFileSync(path.join(DATA, 'NounsTranslation.json'), 'utf8'));
    console.log(`NounsTranslation: ${nt.length} rows`);

    // Build: mainId -> [narrator_id, ...]
    const mainIdToNarrators = new Map();
    for (const row of nt) {
      const narratorId = row.f0;
      const mainId = row.f1;
      if (!mainIdToNarrators.has(mainId)) {
        mainIdToNarrators.set(mainId, []);
      }
      mainIdToNarrators.get(mainId).push(narratorId);
    }
    console.log(`Unique MainIDs needed: ${mainIdToNarrators.size}`);

    // Clear existing
    await client.query('TRUNCATE narrator_biography RESTART IDENTITY');
    console.log('Cleared narrator_biography table.');

    // Stream BookTOC_Services.json line by line
    const filePath = path.join(DATA, 'BookTOC_Services.json');
    console.log('Streaming BookTOC_Services.json...');

    const rl = readline.createInterface({
      input: fs.createReadStream(filePath, { encoding: 'utf8' }),
      crlfDelay: Infinity
    });

    let inserted = 0;
    let linesRead = 0;
    let batchRows = [];
    const BATCH = 200;

    const flushBatch = async () => {
      if (batchRows.length === 0) return;
      const values = [];
      const params = [];
      let pi = 1;
      for (const r of batchRows) {
        values.push(`($${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++})`);
        params.push(r.narrator_id, r.main_id, r.book_id, r.book_name, r.title, r.content);
      }
      await client.query(
        `INSERT INTO narrator_biography (narrator_id, main_id, book_id, book_name, title, content)
         VALUES ${values.join(',')}`,
        params
      );
      inserted += batchRows.length;
      batchRows = [];
    };

    // readline is async; wrap in promise
    await new Promise((resolve, reject) => {
      rl.on('line', async (line) => {
        linesRead++;
        const trimmed = line.trim().replace(/,$/, '');
        if (!trimmed.startsWith('{')) return;

        let rec;
        try { rec = JSON.parse(trimmed); } catch { return; }

        const mainId = rec.f0;
        if (!mainIdToNarrators.has(mainId)) return;

        const bookId = rec.f1;
        const bookName = rec.f2 || '';
        const rawContent = rec.f4 || '';
        const title = rec.f17 || '';
        const content = stripXml(rawContent);

        // Skip if content is just the book name (header entries) or too short
        if (!content || content.length < 5) return;

        const narrators = mainIdToNarrators.get(mainId);
        for (const narratorId of narrators) {
          batchRows.push({ narrator_id: narratorId, main_id: mainId, book_id: bookId, book_name: bookName, title, content });
        }

        if (batchRows.length >= BATCH) {
          rl.pause();
          try {
            await flushBatch();
            if (inserted % 5000 === 0) {
              console.log(`  Lines: ${linesRead.toLocaleString()}, Inserted: ${inserted.toLocaleString()}`);
            }
          } catch (e) {
            reject(e);
            return;
          }
          rl.resume();
        }
      });

      rl.on('close', async () => {
        try {
          await flushBatch();
          resolve();
        } catch (e) { reject(e); }
      });

      rl.on('error', reject);
    });

    console.log(`\nDone streaming. Lines read: ${linesRead.toLocaleString()}, Inserted: ${inserted.toLocaleString()}`);

    // Verify
    const { rows: cnt } = await client.query(
      'SELECT COUNT(*) as total, COUNT(DISTINCT narrator_id) as narrators FROM narrator_biography'
    );
    console.log(`Total: ${cnt[0].total} biography entries for ${cnt[0].narrators} narrators`);

    const { rows: sample } = await client.query(
      `SELECT narrator_id, book_name, LEFT(title, 60) as title, LEFT(content, 100) as content_preview
       FROM narrator_biography WHERE narrator_id = 822 ORDER BY id LIMIT 5`
    );
    console.log('\nSample for narrator 822:');
    sample.forEach(r => console.log(`  [${r.book_name}] ${r.title}\n    ${r.content_preview}`));

  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => { console.error(err); process.exit(1); });
