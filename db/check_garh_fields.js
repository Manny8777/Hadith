const fs = require('fs');
const path = require('path');
const DATA = String.raw`C:\HadithProg\railway\extract\data_named`;

function firstRecord(file) {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(DATA, file), 'utf8'));
    return { count: data.length, fields: Object.keys(data[0] || {}), sample: data[0] };
  } catch(e) { return { error: e.message }; }
}

// Check NounsScientists
console.log('=== NounsScientists.json ===');
const ns = firstRecord('NounsScientists.json');
console.log('Count:', ns.count);
console.log('Fields:', JSON.stringify(ns.fields));
console.log('First record:', JSON.stringify(ns.sample, null, 2));

// Find all records for narrator 822
const nsData = JSON.parse(fs.readFileSync(path.join(DATA, 'NounsScientists.json'), 'utf8'));
const for822 = nsData.filter(r => r.RelaterID === 822);
console.log('\nNounsScientists records for narrator 822:', for822.length);
console.log(JSON.stringify(for822, null, 2));

// Check NounsGarh (grading phrases)
console.log('\n=== NounsGarh.json ===');
const ng = firstRecord('NounsGarh.json');
console.log('Count:', ng.count);
console.log('Fields:', JSON.stringify(ng.fields));
console.log('First 3 records:', JSON.stringify(JSON.parse(fs.readFileSync(path.join(DATA, 'NounsGarh.json'), 'utf8')).slice(0, 3), null, 2));
