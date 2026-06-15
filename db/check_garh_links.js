const fs = require('fs');
const DATA = String.raw`C:\HadithProg\railway\extract\data`;

// NounsGarhLinks: f0=RawyID (narrator), f1=GarhID (NounsGarh.ID), f2=SayID (NounsScientistsSays.ID)
const garhLinks = JSON.parse(fs.readFileSync(DATA + '\\NounsGarhLinks.json', 'utf8'));
console.log('NounsGarhLinks rows:', garhLinks.length);
console.log('Sample:', JSON.stringify(garhLinks.slice(0, 5)));

// NounsGarh: f0=ID, f1=Text (grade label), f2=Sort, f3=IsTaqreeb
const nounsGarh = JSON.parse(fs.readFileSync(DATA + '\\NounsGarh.json', 'utf8'));
console.log('\nNounsGarh rows:', nounsGarh.length);
console.log('Sample:', JSON.stringify(nounsGarh.slice(0, 5)));

// For narrator 822, find their grade labels via GarhLinks
const links822 = garhLinks.filter(r => r.f0 === 822);
console.log('\nNounsGarhLinks for narrator 822:', links822.length);

// Look up each GarhID in NounsGarh
const garhMap = {};
for (const g of nounsGarh) { garhMap[g.f0] = g; }

links822.forEach(link => {
  const garh = garhMap[link.f1];
  if (garh) {
    console.log(`  GarhID=${link.f1} SayID=${link.f2} Grade="${garh.f1}" Sort=${garh.f2} IsTaqreeb=${garh.f3}`);
  }
});

// Check if SayID matches NounsScientistsSays.ID
const says = JSON.parse(fs.readFileSync(DATA + '\\NounsScientistsSays.json', 'utf8'));
const sayMap = {};
for (const s of says) { sayMap[s.f0] = s; }

console.log('\nCross-referenced for narrator 822:');
links822.slice(0, 5).forEach(link => {
  const garh = garhMap[link.f1];
  const say = sayMap[link.f2];
  console.log(`  Grade: "${garh?.f1}" | Say: "${(say?.f3 || '').substring(0, 60)}"`);
});
