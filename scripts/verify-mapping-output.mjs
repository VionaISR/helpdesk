import { loadSharedStrings, parseSheet } from './xlsx-tools.mjs';

const dir = 'C:/Users/viona.suchita.os/AppData/Local/Temp/verify-extract';
const ss = loadSharedStrings(dir);
const rows = parseSheet(dir, 'sheet2.xml', ss);
console.log('total rows:', rows.length);
const header = rows[2];

function show(rowNum) {
  const r = rows[rowNum - 1];
  const nonEmpty = [];
  for (let c = 0; c < r.length; c++) {
    if (r[c] && r[c] !== '') {
      const label = c < 3 ? ['Nama Aplikasi','PIC','Catatan'][c] : header[c];
      nonEmpty.push(`${label}=${r[c]}`);
    }
  }
  console.log(`row${rowNum}:`, nonEmpty.join(' | '));
}

for (const rn of [8, 26, 40, 41, 49, 59, 69, 70]) show(rn);
