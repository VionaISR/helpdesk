import fs from 'fs';
const dataTs = fs.readFileSync('src/lib/data.ts', 'utf-8');
function extractArray(varName) {
  const re = new RegExp(`export const ${varName}[^=]*=\\s*(\\[[\\s\\S]*?\\n\\];)`, 'm');
  const m = dataTs.match(re);
  if (!m) throw new Error('not found: ' + varName);
  const arrLiteral = m[1].slice(0, -1);
  return eval(arrLiteral);
}
const PICS = extractArray('pics');
const APPS = extractArray('apps');
console.log('--- PICS ---');
for (const p of PICS) console.log(p.id, '|', p.name, '|', p.teamId, '|', p.subTeam || '');
console.log('--- TARGET APPS (unassigned, with proposals) ---');
const names = ['[PRJ] - Cash Advance','[PRJ] - HandOver Monitoring','[PRJ] - Project Set Up','[PRJ] - AP Management','[CMN] - Personals','[CMN] - Document Management','[COR] - HRG','[SLS] - PP Online','[SLS] - Online Selling','[SLS] - Property System','[SLS] - Customer Portal','[SLS] - Bank Portal','[SLS] - Dynamics','[RPT] - Report Geneva','[OTH] - Others'];
for (const n of names) {
  const a = APPS.find(x => x.name === n);
  console.log(n, '| prefix=', a.prefix, '| keywords=', JSON.stringify(a.keywords));
}
console.log('--- ALL UNASSIGNED APPS ---');
const unassigned = APPS.filter(a => a.teamId === null);
console.log('count:', unassigned.length);
for (const a of unassigned) console.log(a.name);
