const fs = require('fs');
const path = require('path');

// Read just the first record from the Nouns JSON to see all available fields
const filePath = path.join(String.raw`C:\HadithProg\railway\extract\data_named`, 'Nouns.json');

const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
let buffer = '';
let found = false;

stream.on('data', chunk => {
  if (found) return;
  buffer += chunk;
  // Find the first complete object
  const start = buffer.indexOf('{');
  if (start === -1) return;
  let depth = 0;
  for (let i = start; i < buffer.length; i++) {
    if (buffer[i] === '{') depth++;
    if (buffer[i] === '}') depth--;
    if (depth === 0) {
      const obj = JSON.parse(buffer.slice(start, i + 1));
      console.log('Fields in Nouns.json (first record):');
      console.log(JSON.stringify(Object.keys(obj)));
      console.log('\nFull first record:');
      console.log(JSON.stringify(obj, null, 2));
      found = true;
      stream.destroy();
      break;
    }
  }
});

// Also check if narrator 822 exists and show its full record
stream.on('close', () => {
  if (!found) console.log('Could not parse first record');

  // Now find narrator 822
  console.log('\n--- Looking for narrator 822 ---');
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  console.log(`Total records: ${data.length}`);
  const n = data.find(r => r.ID === 822);
  if (n) {
    console.log('Narrator 822 full record:');
    console.log(JSON.stringify(n, null, 2));
  } else {
    console.log('Narrator 822 not found');
  }
});
