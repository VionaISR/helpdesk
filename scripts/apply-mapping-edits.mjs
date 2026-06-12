import fs from 'fs';
import path from 'path';

const SRC_DIR = 'C:/Users/viona.suchita.os/AppData/Local/Temp/mapping-xlsx-extract';
const OUT_DIR = 'C:/Users/viona.suchita.os/AppData/Local/Temp/mapping-xlsx-extract-out';

const plan = JSON.parse(fs.readFileSync('scripts/.cache/mapping-plan.json', 'utf-8'));

let xml = fs.readFileSync(path.join(SRC_DIR, 'xl/worksheets/sheet2.xml'), 'utf-8');

function escapeXml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fillCell(xml, ref, text) {
  const re = new RegExp(`<c r="${ref}" s="(\\d+)"/>`);
  const m = xml.match(re);
  if (!m) throw new Error(`cell ${ref} not found or not empty`);
  const style = m[1];
  const replacement = `<c r="${ref}" s="${style}" t="inlineStr"><is><t>${escapeXml(text)}</t></is></c>`;
  return xml.replace(re, replacement);
}

let picFillCount = 0, yFillCount = 0;

// 1. PIC fills
for (const p of plan.plan) {
  if (p.picFill) {
    xml = fillCell(xml, `B${p.rowNum}`, p.picFill);
    picFillCount++;
  }
}

// 2. Y marks (existing 65 rows)
for (const p of plan.plan) {
  for (const col of p.yCols) {
    xml = fillCell(xml, `${col}${p.rowNum}`, 'Y');
    yFillCount++;
  }
}

// 3. Build 2 new rows (69, 70) based on row 50's cell-style template
const templateMatch = xml.match(/<row r="50"[^>]*spans="([^"]*)"[^>]*>(.*?)<\/row>/s);
const spans = templateMatch[1];
const templateCells = templateMatch[2].match(/<c r="([A-Z]+)50" s="(\d+)"(?:\s+t="[a-zA-Z]+")?(?:\/>|>.*?<\/c>)/g);
// parse into {col, style}
const colStyles = templateCells.map(c => {
  const m = c.match(/<c r="([A-Z]+)50" s="(\d+)"/);
  return { col: m[1], style: m[2] };
});

function buildRow(rowNum, appName, picName, yCols) {
  const ySet = new Set(yCols);
  let cells = '';
  for (const { col, style } of colStyles) {
    const ref = `${col}${rowNum}`;
    if (col === 'A') {
      cells += `<c r="${ref}" s="${style}" t="inlineStr"><is><t>${escapeXml(appName)}</t></is></c>`;
    } else if (col === 'B' && picName) {
      cells += `<c r="${ref}" s="${style}" t="inlineStr"><is><t>${escapeXml(picName)}</t></is></c>`;
    } else if (ySet.has(col)) {
      cells += `<c r="${ref}" s="${style}" t="inlineStr"><is><t>Y</t></is></c>`;
    } else {
      cells += `<c r="${ref}" s="${style}"/>`;
    }
  }
  return `<row r="${rowNum}" spans="${spans}" ht="16.05" customHeight="1" x14ac:dyDescent="0.3">${cells}</row>`;
}

let newRowsXml = '';
let nextRow = 69;
for (const r of plan.newRows) {
  newRowsXml += buildRow(nextRow, r.appName, r.picFill, r.yCols);
  nextRow++;
}

xml = xml.replace('</sheetData>', `${newRowsXml}</sheetData>`);

// 4. Update dimension
xml = xml.replace('<dimension ref="A1:CX68"/>', `<dimension ref="A1:CX${nextRow - 1}"/>`);

console.log(`PIC fills: ${picFillCount}`);
console.log(`Y-mark fills (existing rows): ${yFillCount}`);
console.log(`New rows appended: ${plan.newRows.length} (rows 69-${nextRow - 1})`);

// 5. Write output: copy whole extract dir, replace sheet2.xml
if (fs.existsSync(OUT_DIR)) fs.rmSync(OUT_DIR, { recursive: true, force: true });
fs.cpSync(SRC_DIR, OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, 'xl/worksheets/sheet2.xml'), xml);
console.log('Written modified sheet2.xml to', OUT_DIR);
