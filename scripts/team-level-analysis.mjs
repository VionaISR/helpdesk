import fs from 'fs';
const a = JSON.parse(fs.readFileSync('scripts/.cache/analysis.json', 'utf-8'));

const PIC_TEAM = {
  'Lady Yohana': 'team-license', 'Eric Yonalis': 'team-license', 'Viona': 'team-license',
  'Ivan Tenusa': 'team-ivan', 'Apri': 'team-ivan', 'Kevin': 'team-ivan', 'Lukas Wijaya K': 'team-ivan',
  'Nicholas': 'team-nicholas', 'Leonagata': 'team-nicholas',
  'Joshua K': 'team-joshua', 'Christian': 'team-joshua',
  'Andika': 'team-andika',
};

console.log('=== TEAM-LEVEL AGGREGATION for proposals ===');
for (const p of a.proposals) {
  if (p.status === 'NO_DATA') continue;
  const teamCounts = {};
  for (const [pic, cnt] of p.picDistribution) {
    const team = PIC_TEAM[pic] || 'UNKNOWN';
    teamCounts[team] = (teamCounts[team] || 0) + cnt;
  }
  const teamSorted = Object.entries(teamCounts).sort((x, y) => y[1] - x[1]);
  console.log(`${p.app} (n=${p.ticketCount})`);
  console.log('  pic:  ', p.picDistribution.map(([n, c]) => `${n}=${c}`).join(', '));
  console.log('  team: ', teamSorted.map(([n, c]) => `${n}=${c}`).join(', '));
}

console.log('\n=== MATRIX for proposal apps + new apps ===');
const targets = new Set([
  '[PRJ] - Cash Advance','[PRJ] - HandOver Monitoring','[PRJ] - Project Set Up','[PRJ] - AP Management',
  '[CMN] - Personals','[CMN] - Document Management','[COR] - HRG','[SLS] - PP Online','[SLS] - Online Selling',
  '[SLS] - Property System','[SLS] - Customer Portal','[SLS] - Bank Portal','[SLS] - Dynamics','[RPT] - Report Geneva',
  '[OTH] - Others', '[SLS] - Website', '[SLS] - iforte',
]);
for (const m of a.matrix) {
  if (!targets.has(m.app)) continue;
  console.log(`- ${m.app}: ${m.tasks.map(([t, c]) => `${t}(${c})`).join(', ')}`);
}

console.log('\n=== New apps pic/team distribution ===');
const tickets = JSON.parse(fs.readFileSync('scripts/.cache/tickets.json', 'utf-8'));
const nameApps = JSON.parse(fs.readFileSync('scripts/.cache/name_apps.json', 'utf-8'));
const picRows = JSON.parse(fs.readFileSync('scripts/.cache/pic.json', 'utf-8'));
function buildValueMap(rows) {
  const map = new Map();
  let start = rows[0] && rows[0][0] === 'ticket_id' ? 1 : 0;
  for (let i = start; i < rows.length; i++) {
    const r = rows[i];
    if (r[3]) map.set(r[0], r[3]);
  }
  return map;
}
const appMap = buildValueMap(nameApps);
const picMap = buildValueMap(picRows);
for (const newApp of ['[SLS] - Website', '[SLS] - iforte']) {
  const ids = [...appMap.entries()].filter(([, v]) => v === newApp).map(([k]) => k);
  const dist = {};
  for (const id of ids) {
    const pic = picMap.get(id) || '(none)';
    dist[pic] = (dist[pic] || 0) + 1;
  }
  console.log(`${newApp}: n=${ids.length}, pics:`, dist);
}
