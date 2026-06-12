import fs from 'fs';
const dataTs = fs.readFileSync('src/lib/data.ts', 'utf-8');
function extractArray(varName) {
  const re = new RegExp(`export const ${varName}[^=]*=\\s*(\\[[\\s\\S]*?\\n\\];)`, 'm');
  const m = dataTs.match(re);
  if (!m) throw new Error('not found: ' + varName);
  const arrLiteral = m[1].slice(0, -1);
  return eval(arrLiteral);
}
const SPECIFIC_TASKS = extractArray('specificTasks');
console.log('count:', SPECIFIC_TASKS.length);
for (const t of SPECIFIC_TASKS) console.log(t.name);
