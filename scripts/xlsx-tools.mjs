// Minimal XLSX reader (no deps) - reads an already-extracted .xlsx (zip) directory.
// Usage:
//   node xlsx-tools.mjs <extractDir> summary <sheetFile.xml>            -> prints header + row count + first 5 rows
//   node xlsx-tools.mjs <extractDir> dump <sheetFile.xml> <outJson>     -> dumps full sheet as JSON array of arrays
import fs from 'fs';
import path from 'path';

function unescapeXml(s) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&');
}

export function loadSharedStrings(extractDir) {
  const file = path.join(extractDir, 'xl', 'sharedStrings.xml');
  if (!fs.existsSync(file)) return [];
  const xml = fs.readFileSync(file, 'utf-8');
  const out = [];
  const siRe = /<si>(.*?)<\/si>/gs;
  const tRe = /<t[^>]*>(.*?)<\/t>|<t[^>]*\/>/gs;
  let m;
  while ((m = siRe.exec(xml))) {
    const block = m[1];
    let text = '';
    let tm;
    tRe.lastIndex = 0;
    while ((tm = tRe.exec(block))) {
      text += tm[1] ?? '';
    }
    out.push(unescapeXml(text));
  }
  return out;
}

function colLetterToIndex(letters) {
  let idx = 0;
  for (const ch of letters) idx = idx * 26 + (ch.charCodeAt(0) - 64);
  return idx - 1; // zero-based
}

export function parseSheet(extractDir, sheetFile, sharedStrings) {
  const file = path.join(extractDir, 'xl', 'worksheets', sheetFile);
  const xml = fs.readFileSync(file, 'utf-8');
  const rows = [];
  const rowRe = /<row[^>]*r="(\d+)"[^>]*>(.*?)<\/row>/gs;
  const cellRe = /<c r="([A-Z]+)(\d+)"(?:[^>]*\bt="([a-zA-Z]+)")?[^>]*>(?:(?:<v>(.*?)<\/v>)|(?:<is>(.*?)<\/is>))?<\/c>/gs;
  let rm;
  while ((rm = rowRe.exec(xml))) {
    const rowContent = rm[2];
    const rowArr = [];
    let cm;
    cellRe.lastIndex = 0;
    while ((cm = cellRe.exec(rowContent))) {
      const col = colLetterToIndex(cm[1]);
      const type = cm[3];
      let val = '';
      if (type === 's' && cm[4] !== undefined) {
        val = sharedStrings[parseInt(cm[4], 10)] ?? '';
      } else if (type === 'inlineStr' && cm[5] !== undefined) {
        const tm = /<t[^>]*>(.*?)<\/t>/s.exec(cm[5]);
        val = tm ? unescapeXml(tm[1]) : '';
      } else if (cm[4] !== undefined) {
        val = unescapeXml(cm[4]);
      }
      rowArr[col] = val;
    }
    for (let i = 0; i < rowArr.length; i++) if (rowArr[i] === undefined) rowArr[i] = '';
    rows.push(rowArr);
  }
  return rows;
}

// CLI
const [, , extractDir, mode, sheetFile, outArg] = process.argv;
if (mode === 'summary') {
  const ss = loadSharedStrings(extractDir);
  const rows = parseSheet(extractDir, sheetFile, ss);
  console.log('rowCount:', rows.length);
  console.log('header:', JSON.stringify(rows[0]));
  for (let i = 1; i <= 5 && i < rows.length; i++) {
    console.log(`row${i}:`, JSON.stringify(rows[i]));
  }
} else if (mode === 'dump') {
  const ss = loadSharedStrings(extractDir);
  const rows = parseSheet(extractDir, sheetFile, ss);
  fs.writeFileSync(outArg, JSON.stringify(rows));
  console.log('wrote', rows.length, 'rows to', outArg);
}
