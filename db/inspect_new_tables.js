const fs = require('fs');
const path = require('path');
const DATA = String.raw`C:\HadithProg\railway\extract\data_new2`;

const newFiles = [
  'ScientistsCriticizeRawi.json',
  'NounsGarhOrder.json',
  'TaragemRwa.json',
  'RawiBiography.json',
  'ScientestsExpressions.json',
  'NounsStat1.json',
  'RawiFawaaed.json',
];

for (const f of newFiles) {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8'));
    console.log(`\n=== ${f} (${data.length} rows) ===`);
    if (data.length > 0) {
      console.log('Fields:', JSON.stringify(Object.keys(data[0])));
      console.log('Sample:', JSON.stringify(data[0], null, 2));
    }
  } catch(e) {
    console.log(`\n=== ${f}: ${e.message} ===`);
  }
}
