const fs = require('fs');
const path = require('path');
const DATA = String.raw`C:\HadithProg\railway\extract\data_named`;

function inspect(file) {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(DATA, file), 'utf8'));
    return { count: data.length, fields: Object.keys(data[0] || {}), sample: data.slice(0, 2) };
  } catch(e) { return { error: e.message }; }
}

// Check all unexplored tables
const files = [
  'HadithJudgmentHits.json',
  'HadithJudgmentLinks.json',
  'HadithJudgmentSays.json',
  'Gwamh.json',
  'GwamhItems.json',
  'MatnDates.json',
  'AsanedRelations.json',
  'AsanedRelationsTypes.json',
  'AsanedTahdeth.json',
  'Amthal.json',
];

for (const file of files) {
  const r = inspect(file);
  if (r.error) { console.log(`\n${file}: ERROR - ${r.error}`); continue; }
  console.log(`\n=== ${file} (${r.count} rows) ===`);
  console.log('Fields:', JSON.stringify(r.fields));
  if (r.count > 0) console.log('Sample:', JSON.stringify(r.sample[0], null, 2));
}
