import fs from 'fs';

const analysis = JSON.parse(fs.readFileSync('scripts/.cache/analysis.json', 'utf-8'));
const mappingRows = JSON.parse(fs.readFileSync('scripts/.cache/mapping-sheet.json', 'utf-8'));

// data.ts apps/pics (post-edit)
const dataTs = fs.readFileSync('src/lib/data.ts', 'utf-8');
function extractArray(varName) {
  const re = new RegExp(`export const ${varName}[^=]*=\\s*(\\[[\\s\\S]*?\\n\\];)`, 'm');
  const m = dataTs.match(re);
  const arrLiteral = m[1].slice(0, -1);
  return eval(arrLiteral);
}
const APPS = extractArray('apps');
const PICS = extractArray('pics');
const picNameById = new Map(PICS.map(p => [p.id, p.name]));
const appByName = new Map(APPS.map(a => [a.name, a]));

// normalization map: raw export task name -> canonical specificTasks name
const TASK_NORM = {
  'Update field': 'Update Field',
  'permintaan Data': 'Request Data On Demand',
  'taan perubahan status project code': 'Perubahan Status Project',
  'Subscription Report': 'Setting Subscription Report',
  'Akses User Baru': 'Penambahan Akses User',
};
function normTask(t) { return TASK_NORM[t] || t; }

const header = mappingRows[2];
const taskCols = header.slice(3); // 99 task names, column D.. onward
const taskColIndex = new Map(taskCols.map((t, i) => [t, i])); // i -> offset from col D (0-based)

function colIndexToLetter(idx) { // idx 0-based overall column (A=0)
  let n = idx + 1;
  let s = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

// build appName -> normalized task hit set (from May export)
const appTaskHits = new Map();
const newTaskAppHits = {}; // for the 4 genuinely-new tasks: appName -> [taskName,...]
for (const m of analysis.matrix) {
  const hits = new Set();
  for (const [taskName] of m.tasks) {
    const norm = normTask(taskName);
    if (taskColIndex.has(norm)) {
      hits.add(norm);
    } else {
      (newTaskAppHits[m.app] = newTaskAppHits[m.app] || []).push(norm);
    }
  }
  appTaskHits.set(m.app, hits);
}

// ---- Plan for existing 65 rows ----
const plan = [];
for (let i = 3; i < mappingRows.length; i++) {
  const row = mappingRows[i];
  const appName = row[0];
  const existingPic = row[1] || '';
  const app = appByName.get(appName);
  let picFill = null;
  if (!existingPic && app && app.picId) {
    picFill = picNameById.get(app.picId);
  }
  const hits = appTaskHits.get(appName) || new Set();
  const yCols = [...hits].map(t => colIndexToLetter(3 + taskColIndex.get(t)));
  plan.push({ rowNum: i + 1, appName, existingPic, picFill, yTasks: [...hits], yCols });
}

// ---- New rows for Website/iforte ----
const newRows = [];
for (const appName of ['[SLS] - Website', '[SLS] - iforte']) {
  const app = appByName.get(appName);
  const picFill = app && app.picId ? picNameById.get(app.picId) : null;
  const hits = appTaskHits.get(appName) || new Set();
  const yCols = [...hits].map(t => colIndexToLetter(3 + taskColIndex.get(t)));
  newRows.push({ appName, picFill, yTasks: [...hits], yCols });
}

console.log('=== PIC fills ===');
for (const p of plan) if (p.picFill) console.log(`row${p.rowNum} ${p.appName}: PIC -> ${p.picFill}`);

console.log('\n=== Y-mark fills (existing 65 rows) ===');
for (const p of plan) if (p.yCols.length) console.log(`row${p.rowNum} ${p.appName}: ${p.yTasks.join(', ')} -> cols ${p.yCols.join(',')}`);

console.log('\n=== New rows ===');
for (const r of newRows) console.log(JSON.stringify(r));

console.log('\n=== New-task hits not representable as Y (no column in Mapping sheet) ===');
console.log(JSON.stringify(newTaskAppHits, null, 2));

fs.writeFileSync('scripts/.cache/mapping-plan.json', JSON.stringify({ plan, newRows, newTaskAppHits }, null, 2));
