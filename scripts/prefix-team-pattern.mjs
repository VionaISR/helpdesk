import fs from 'fs';
const dataTs = fs.readFileSync('src/lib/data.ts', 'utf-8');
function extractArray(varName) {
  const re = new RegExp(`export const ${varName}[^=]*=\\s*(\\[[\\s\\S]*?\\n\\];)`, 'm');
  const m = dataTs.match(re);
  if (!m) throw new Error('not found: ' + varName);
  const arrLiteral = m[1].slice(0, -1);
  return eval(arrLiteral);
}
const APPS = extractArray('apps');
const assigned = APPS.filter(a => a.teamId !== null);
const byPrefix = {};
for (const a of assigned) {
  const prefix = a.name.match(/^\[([A-Z]+)\]/)[1];
  byPrefix[prefix] = byPrefix[prefix] || {};
  byPrefix[prefix][a.teamId] = (byPrefix[prefix][a.teamId] || 0) + 1;
}
for (const [prefix, teams] of Object.entries(byPrefix)) {
  console.log(prefix, JSON.stringify(teams));
}
console.log('--- BAS apps currently assigned ---');
for (const a of APPS.filter(a => a.name.startsWith('[BAS]'))) {
  console.log(a.name, '| teamId=', a.teamId, '| picId=', a.picId);
}
console.log('--- SDH apps currently assigned ---');
for (const a of APPS.filter(a => a.name.startsWith('[SDH]'))) {
  console.log(a.name, '| teamId=', a.teamId, '| picId=', a.picId);
}
