#!/usr/bin/env node
// Provision Supabase Auth users (auth.users + profiles) for the IT Helpdesk.
//
// Run AFTER applying supabase/schema.sql (v6). Idempotent — re-running resets
// passwords/metadata for existing users and upserts their profiles.
//
//   NEXT_PUBLIC_SUPABASE_URL=...  SUPABASE_SERVICE_ROLE_KEY=...  \
//     node scripts/provision-auth.mjs
//
// Provisions:
//   1. The 14 built-in seed accounts (password = SEED_DEFAULT_PASSWORD).
//   2. Every row already in app_users (password = its default_password).

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';

// Plain `node` does NOT auto-load .env.local (only Next.js does). Load it (and
// .env) manually so the same vars you put in .env.local work here. Existing
// process.env vars win, so you can still override on the command line.
function loadEnv(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([\w.]+)\s*=\s*(.*?)\s*$/);
    if (!m) continue; // skips blanks and # comments
    let val = m[2];
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(m[1] in process.env)) process.env[m[1]] = val;
  }
}
loadEnv('.env.local');
loadEnv('.env');

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SEED_DEFAULT_PASSWORD = process.env.NEXT_PUBLIC_SEED_PASSWORD || 'ithelpdesk2026';

if (!URL || !KEY) {
  console.error('✗ Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first.');
  process.exit(1);
}

const sb = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });

// Mirror of src/lib/account-store.ts SEED_ACCOUNTS (kept in sync manually — this
// .mjs can't import the TS module).
const SEED_ACCOUNTS = [
  { email: 'lady.yohana@ithelpdesk.com',       role: 'admin', name: 'Lady Yohana',        picId: 'p-lady' },
  { email: 'eric.yonalis@ithelpdesk.com',       role: 'admin', name: 'Eric Yonalis',       picId: 'p-eric' },
  { email: 'viona@ithelpdesk.com',              role: 'admin', name: 'Viona',              picId: 'p-vio' },
  { email: 'license.admin@ithelpdesk.com',      role: 'pic',   name: 'License Admin',      picId: 'p-license',   teamId: 'team-license' },
  { email: 'ivan.tenusa@ithelpdesk.com',        role: 'pic',   name: 'Ivan Tenusa',        picId: 'p-ivan',      teamId: 'team-ivan' },
  { email: 'apri@ithelpdesk.com',               role: 'pic',   name: 'Apri',               picId: 'p-apri',      teamId: 'team-ivan' },
  { email: 'kevin@ithelpdesk.com',              role: 'pic',   name: 'Kevin',              picId: 'p-kevin',     teamId: 'team-ivan' },
  { email: 'lukas.wijaya@ithelpdesk.com',       role: 'pic',   name: 'Lukas Wijaya K',     picId: 'p-lukas',     teamId: 'team-ivan' },
  { email: 'nicholas.suryatama@ithelpdesk.com', role: 'pic',   name: 'Nicholas Suryatama', picId: 'p-nicholas',  teamId: 'team-nicholas' },
  { email: 'leonagata@ithelpdesk.com',          role: 'pic',   name: 'Leonagata',          picId: 'p-leo',       teamId: 'team-nicholas' },
  { email: 'joshua.kartono@ithelpdesk.com',     role: 'pic',   name: 'Joshua Kartono',     picId: 'p-joshua',    teamId: 'team-joshua' },
  { email: 'christian@ithelpdesk.com',          role: 'pic',   name: 'Christian',          picId: 'p-christian', teamId: 'team-joshua' },
  { email: 'andika@ithelpdesk.com',             role: 'pic',   name: 'Rachmad Andika',     picId: 'p-andika',    teamId: 'team-andika' },
  { email: 'andi.pratama@ithelpdesk.com',       role: 'user',  name: 'Andi Pratama',       dept: 'Finance' },
  { email: 'dewi.l@ithelpdesk.com',             role: 'user',  name: 'Dewi Lestari',       dept: 'Operations' },
];

// Build email -> existing auth user id map (paged).
async function loadExistingUsers() {
  const map = new Map();
  let page = 1;
  for (;;) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    for (const u of data.users) if (u.email) map.set(u.email.toLowerCase(), u.id);
    if (data.users.length < 200) break;
    page += 1;
  }
  return map;
}

async function provision(acc, password, existing) {
  const email = acc.email.toLowerCase();
  const user_metadata = {
    role: acc.role,
    name: acc.name,
    pic_id: acc.picId ?? null,
    dept: acc.dept ?? null,
    team_id: acc.teamId ?? null,
  };

  let userId = existing.get(email);
  if (userId) {
    const { error } = await sb.auth.admin.updateUserById(userId, { password, user_metadata });
    if (error) { console.error(`  ✗ update ${email}: ${error.message}`); return; }
  } else {
    const { data, error } = await sb.auth.admin.createUser({ email, password, email_confirm: true, user_metadata });
    if (error || !data.user) { console.error(`  ✗ create ${email}: ${error?.message}`); return; }
    userId = data.user.id;
  }

  const { error: profErr } = await sb.from('profiles').upsert({
    id: userId,
    email,
    name: acc.name,
    role: acc.role,
    pic_id: acc.picId ?? null,
    dept: acc.dept ?? null,
    team_id: acc.teamId ?? null,
  });
  if (profErr) { console.error(`  ✗ profile ${email}: ${profErr.message}`); return; }

  console.log(`  ✓ ${email} (${acc.role})`);
}

async function main() {
  const existing = await loadExistingUsers();

  console.log(`Provisioning ${SEED_ACCOUNTS.length} seed accounts (password: ${SEED_DEFAULT_PASSWORD})...`);
  for (const acc of SEED_ACCOUNTS) await provision(acc, SEED_DEFAULT_PASSWORD, existing);

  const { data: appUsers, error } = await sb.from('app_users').select('*');
  if (error) { console.error('✗ fetch app_users:', error.message); }
  else if (appUsers?.length) {
    console.log(`\nProvisioning ${appUsers.length} app_users rows (password: their default_password)...`);
    for (const u of appUsers) {
      await provision(
        { email: u.email, role: u.role, name: u.name, dept: u.dept, teamId: u.team_id },
        u.default_password,
        existing,
      );
    }
  }

  console.log('\nDone.');
}

main().catch(e => { console.error(e); process.exit(1); });
