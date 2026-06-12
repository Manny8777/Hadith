const fs = require('fs');
const path = require('path');
const DATA = String.raw`C:\HadithProg\railway\extract\data_named`;

// Check HadithsServicesTypes - what types exist
const types = JSON.parse(fs.readFileSync(path.join(DATA, 'HadithsServicesTypes.json'), 'utf8'));
console.log('=== HadithsServicesTypes ===');
console.log('Count:', types.length);
console.log('Fields:', Object.keys(types[0] || {}));
console.log('All types:');
types.forEach(t => console.log(`  TypeID=${t.ID}: ${JSON.stringify(t)}`));

// Now check what TypeIDs appear in HadithsServices
// and look for records that link to NounsScientists IDs
console.log('\n=== HadithsServices TypeID distribution ===');
const services = JSON.parse(fs.readFileSync(path.join(DATA, 'HadithsServices.json'), 'utf8'));
const typeCounts = {};
services.forEach(r => {
  typeCounts[r.TypeID] = (typeCounts[r.TypeID] || 0) + 1;
});
Object.entries(typeCounts).sort((a,b) => b[1]-a[1]).forEach(([k,v]) => {
  console.log(`  TypeID=${k}: ${v} rows`);
});

// Check NounsScientists more carefully - what ScientistIDs link to what
const ns = JSON.parse(fs.readFileSync(path.join(DATA, 'NounsScientists.json'), 'utf8'));
console.log('\n=== NounsScientists fields again ===');
console.log('Fields:', Object.keys(ns[0] || {}));
console.log('First 5:', JSON.stringify(ns.slice(0,5), null, 2));
// Count how many narrators have entries
const relaterIds = new Set(ns.map(r => r.RelaterID).filter(id => id !== 0));
console.log(`\nDistinct narrators with entries: ${relaterIds.size}`);
