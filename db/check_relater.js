const fs = require('fs');
const DATA = String.raw`C:\HadithProg\railway\extract\data`;

const scientists = JSON.parse(fs.readFileSync(DATA + '\\NounsScientists.json', 'utf8'));
console.log('NounsScientists rows:', scientists.length);

// f0=ID, f1=ScientistID, f2=RelaterID, f3=ScientistName, f4=RelaterName
// Check samples with non-empty RelaterName
const withRelater = scientists.filter(s => s.f4 && s.f4.trim());
console.log('With RelaterName:', withRelater.length);
console.log('\nSamples with RelaterName:');
withRelater.slice(0, 20).forEach(s => {
  console.log(`  ScientistID=${s.f1} ScientistName="${s.f3}" RelaterID=${s.f2} RelaterName="${s.f4}"`);
});

// Check for specific patterns
const relaterNames = new Set(withRelater.map(s => s.f4));
console.log('\nUnique RelaterName values (first 30):');
Array.from(relaterNames).slice(0, 30).forEach(r => console.log('  "' + r + '"'));
