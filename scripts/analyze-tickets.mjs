// Analyze the Spiceworks ticket export (May 2026) and cross-reference with
// existing app_routing / specificTasks data to propose fills for:
//  1) app -> team/PIC mapping for apps currently unassigned (teamId === null)
//  2) app x specific-task matrix (which tasks really occur per app)
import fs from 'fs';

function readJson(p) { return JSON.parse(fs.readFileSync(p, 'utf-8')); }

// ---- Load current app/pic/specificTask master data from data.ts ----
const dataTs = fs.readFileSync('src/lib/data.ts', 'utf-8');
function extractArray(varName) {
  const re = new RegExp(`export const ${varName}[^=]*=\\s*(\\[[\\s\\S]*?\\n\\];)`, 'm');
  const m = dataTs.match(re);
  if (!m) throw new Error('not found: ' + varName);
  const arrLiteral = m[1].slice(0, -1); // strip trailing ';'
  return eval(arrLiteral);
}
const APPS = extractArray('apps');
const PICS = extractArray('pics');
const SPECIFIC_TASKS = extractArray('specificTasks');

// ---- Load exported ticket data ----
const tickets = readJson('scripts/.cache/tickets.json');
const nameApps = readJson('scripts/.cache/name_apps.json');
const picRows = readJson('scripts/.cache/pic.json');
const specTaskRows = readJson('scripts/.cache/specific_task.json');
const catRows = readJson('scripts/.cache/ticket_categories.json');

// category id -> name
const categoryMap = new Map();
for (const r of catRows.slice(1)) categoryMap.set(r[0], r[2]);

function buildValueMap(rows, expectName) {
  const map = new Map();
  let start = 0;
  if (rows[0] && rows[0][0] === 'ticket_id') start = 1; // header row present
  for (let i = start; i < rows.length; i++) {
    const r = rows[i];
    const ticketId = r[0];
    const value = r[3] ?? '';
    if (value) map.set(ticketId, value);
  }
  return map;
}
const appValueMap = buildValueMap(nameApps);
const picValueMap = buildValueMap(picRows);
const taskValueMap = buildValueMap(specTaskRows);

// ---- Join into ticket records ----
const records = [];
for (const r of tickets.slice(1)) {
  const id = r[0];
  records.push({
    id,
    number: r[1],
    summary: r[7],
    priority: r[9],
    status: r[10],
    categoryId: r[3],
    categoryName: categoryMap.get(r[3]) || '',
    app: appValueMap.get(id) || '',
    pic: picValueMap.get(id) || '',
    specificTask: taskValueMap.get(id) || '',
    createdAt: r[18],
  });
}

const total = records.length;
const withApp = records.filter(x => x.app).length;
const withPic = records.filter(x => x.pic).length;
const withTask = records.filter(x => x.specificTask).length;

// ---- App name normalization (fix known typos from Spiceworks) ----
const APP_NAME_FIX = {
  '[TMD] - Billling System': '[TMD] - Billing System',
};
function normApp(name) { return APP_NAME_FIX[name] || name; }

// ---- PIC name -> our pic id ----
const PIC_ALIAS = {
  'Andika': 'p-andika',
  'Apri': 'p-apri',
  'Christian': 'p-christian',
  'Eric Yonalis': 'p-eric',
  'Ivan Tenusa': 'p-ivan',
  'Joshua K': 'p-joshua',
  'Kevin': 'p-kevin',
  'Lady Yohana': 'p-lady',
  'Leonagata': 'p-leo',
  'Lukas Wijaya K': 'p-lukas',
  'Nicholas': 'p-nicholas',
  'Viona': 'p-vio',
};
const picById = new Map(PICS.map(p => [p.id, p]));

// ---- Build per-app stats ----
const appStats = new Map(); // appName(normalized) -> { count, pics: Map, tasks: Map, samples: [] }
for (const rec of records) {
  if (!rec.app) continue;
  const app = normApp(rec.app);
  if (!appStats.has(app)) appStats.set(app, { count: 0, pics: new Map(), tasks: new Map(), unmatchedPics: new Set() });
  const s = appStats.get(app);
  s.count++;
  if (rec.pic) {
    s.pics.set(rec.pic, (s.pics.get(rec.pic) || 0) + 1);
    if (!PIC_ALIAS[rec.pic]) s.unmatchedPics.add(rec.pic);
  }
  if (rec.specificTask) {
    s.tasks.set(rec.specificTask, (s.tasks.get(rec.specificTask) || 0) + 1);
  }
}

// ---- New apps seen in export but not in APPS ----
const knownAppNames = new Set(APPS.map(a => a.name));
const newApps = [...appStats.keys()].filter(a => !knownAppNames.has(a));

// ---- New PIC names seen but not aliased ----
const allPicNames = new Set();
for (const rec of records) if (rec.pic) allPicNames.add(rec.pic);
const newPics = [...allPicNames].filter(p => !PIC_ALIAS[p]);

// ---- New specific tasks seen but not in SPECIFIC_TASKS ----
const knownTaskNames = new Set(SPECIFIC_TASKS.map(t => t.name));
const allTaskNames = new Set();
for (const rec of records) if (rec.specificTask) allTaskNames.add(rec.specificTask);
const newTasks = [...allTaskNames].filter(t => !knownTaskNames.has(t));

// ---- Proposals for unassigned apps (teamId === null) ----
const unassigned = APPS.filter(a => a.teamId === null);
const proposals = [];
for (const app of unassigned) {
  const stat = appStats.get(app.name);
  if (!stat || stat.pics.size === 0) {
    proposals.push({ app: app.name, ticketCount: stat ? stat.count : 0, status: 'NO_DATA' });
    continue;
  }
  // most common pic
  const sorted = [...stat.pics.entries()].sort((a, b) => b[1] - a[1]);
  const [topPicName, topCount] = sorted[0];
  const picId = PIC_ALIAS[topPicName];
  const pic = picId ? picById.get(picId) : null;
  proposals.push({
    app: app.name,
    ticketCount: stat.count,
    status: pic ? 'SUGGEST' : 'UNMAPPED_PIC',
    topPic: topPicName,
    topPicCount: topCount,
    totalPicVotes: stat.pics.size,
    suggestedPicId: picId || null,
    suggestedTeamId: pic ? pic.teamId : null,
    picDistribution: sorted,
  });
}

// ---- App x SpecificTask matrix (only apps/tasks that have at least 1 hit) ----
const matrix = [];
for (const [app, stat] of appStats.entries()) {
  if (stat.tasks.size === 0) continue;
  matrix.push({ app, tasks: [...stat.tasks.entries()].sort((a, b) => b[1] - a[1]) });
}

// ---- Output ----
const out = {
  totals: { total, withApp, withPic, withTask },
  newApps,
  newPics,
  newTasks,
  unassignedAppsCount: unassigned.length,
  proposals,
  matrix,
};
fs.writeFileSync('scripts/.cache/analysis.json', JSON.stringify(out, null, 2));

console.log('=== COVERAGE ===');
console.log(`total tickets: ${total}, with app: ${withApp}, with pic: ${withPic}, with specificTask: ${withTask}`);

console.log('\n=== NEW APPS (in export, not in current apps list) ===');
console.log(newApps);

console.log('\n=== NEW PICS (in export, not aliased to current pics) ===');
console.log(newPics);

console.log('\n=== NEW SPECIFIC TASKS (in export, not in current specificTasks) ===');
console.log(newTasks);

console.log(`\n=== PROPOSALS for unassigned apps (${unassigned.length} total) ===`);
const withData = proposals.filter(p => p.status !== 'NO_DATA');
console.log(`apps with at least 1 ticket in this export: ${withData.length}`);
for (const p of proposals) {
  if (p.status === 'NO_DATA') continue;
  console.log(`- ${p.app} (n=${p.ticketCount}) -> top PIC: ${p.topPic} (${p.topPicCount}/${p.totalPicVotes}) => ${p.suggestedPicId || 'UNMAPPED'} / team=${p.suggestedTeamId}`);
}

console.log('\n=== App x SpecificTask matrix (apps with hits) ===');
for (const m of matrix) {
  console.log(`- ${m.app}: ${m.tasks.map(([t, c]) => `${t}(${c})`).join(', ')}`);
}
