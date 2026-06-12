import fs from 'fs';
const rows = JSON.parse(fs.readFileSync('scripts/.cache/mapping-sheet.json', 'utf-8'));
const header = rows[2];
const taskNames = header.slice(3); // D onwards
console.log('task columns:', taskNames.length);

console.log('\n--- App rows (3..67): name | PIC | Catatan ---');
for (let i = 3; i < rows.length; i++) {
  const r = rows[i];
  console.log(`row${i + 1}: "${r[0]}" | PIC="${r[1] || ''}" | Catatan="${r[2] || ''}"`);
}

// check for any Y anywhere in D.. columns
let yCount = 0;
for (let i = 3; i < rows.length; i++) {
  const r = rows[i];
  for (let c = 3; c < r.length; c++) {
    if (r[c] && r[c].trim().toUpperCase() === 'Y') yCount++;
  }
}
console.log('\nExisting Y marks total:', yCount);

// check presence of Website / iforte
const names = rows.slice(3).map(r => r[0]);
console.log('\nHas [SLS] - Website?', names.includes('[SLS] - Website'));
console.log('Has [SLS] - iforte?', names.includes('[SLS] - iforte'));
console.log('Total app rows:', names.length);
