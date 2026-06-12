import fs from 'fs';
const xml = fs.readFileSync('C:/Users/viona.suchita.os/AppData/Local/Temp/mapping-xlsx-extract/xl/worksheets/sheet2.xml', 'utf-8');
console.log('dimension:', (xml.match(/<dimension[^>]*\/>/) || [])[0]);
console.log('conditionalFormatting:', xml.match(/<conditionalFormatting[\s\S]*?<\/conditionalFormatting>/g));
console.log('mergeCells:', (xml.match(/<mergeCells[\s\S]*?<\/mergeCells>/) || [])[0]);
console.log('autoFilter:', (xml.match(/<autoFilter[^>]*\/>/) || [])[0]);
console.log('cols:', (xml.match(/<cols>[\s\S]*?<\/cols>/) || [])[0]);
console.log('sheetFormatPr:', (xml.match(/<sheetFormatPr[^>]*\/>/) || [])[0]);
// last row
const lastRowMatch = xml.match(/<row[^>]*r="68"[^>]*>.*?<\/row>/s);
console.log('row68 (last row) tail:', lastRowMatch ? lastRowMatch[0].slice(-400) : 'not found');
// what comes after sheetData close
const sdEnd = xml.indexOf('</sheetData>');
console.log('after </sheetData>:', xml.slice(sdEnd, sdEnd + 500));
console.log('\ntotal length:', xml.length);
console.log('style 7 / 12 lookups will be checked in styles.xml');
