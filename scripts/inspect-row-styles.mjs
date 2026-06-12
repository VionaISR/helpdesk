import fs from 'fs';
const xml = fs.readFileSync('C:/Users/viona.suchita.os/AppData/Local/Temp/mapping-xlsx-extract/xl/worksheets/sheet2.xml', 'utf-8');
for (const rn of [50, 68]) {
  const m = xml.match(new RegExp(`<row[^>]*r="${rn}"[^>]*>(.*?)</row>`, 's'));
  const content = m[1];
  const cells = content.match(/<c [^>]*\/?>(?:.*?<\/c>)?/g);
  console.log(`row${rn} first 5 cells:`, cells.slice(0, 5).join(' | '));
}
