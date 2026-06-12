// One-off check: sign in as each test account and confirm
// profiles.role / pic_id / team_id match src/lib/account-store.ts mapping.
// Usage: node scripts/verify-roles.mjs

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => {
      const i = l.indexOf('=');
      return [l.slice(0, i), l.slice(i + 1)];
    })
);

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const accounts = [
  { email: 'viona@lippo.id', password: 'IT@Vio2026', expect: { role: 'admin' } },
  { email: 'leonagata@lippo.id', password: 'IT@Leona2026', expect: { role: 'pic', pic_id: 'p-leo', team_id: 'team-nicholas' } },
  { email: 'andi.pratama@lippo.id', password: 'IT@Andi2026', expect: { role: 'user', dept: 'Finance' } },
];

const redirect = role => (role === 'admin' ? '/admin' : role === 'pic' ? '/pic' : '/dashboard');

for (const acc of accounts) {
  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: acc.email,
    password: acc.password,
  });

  if (authError) {
    console.log(`[FAIL] ${acc.email}: login error -> ${authError.message}`);
    continue;
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('name, role, pic_id, team_id, dept, is_head')
    .eq('id', authData.user.id)
    .single();

  if (profileError || !profile) {
    console.log(`[FAIL] ${acc.email}: profile not found -> ${profileError?.message}`);
    await supabase.auth.signOut();
    continue;
  }

  const checks = Object.entries(acc.expect).map(([k, v]) => {
    const ok = profile[k] === v;
    return `${k}=${profile[k]} (expect ${v}) ${ok ? 'OK' : 'MISMATCH'}`;
  });

  const status = checks.every(c => c.endsWith('OK')) ? 'PASS' : 'FAIL';
  console.log(`[${status}] ${acc.email} -> name=${profile.name}, role=${profile.role}, redirect=${redirect(profile.role)}`);
  for (const c of checks) console.log(`        ${c}`);

  await supabase.auth.signOut();
}
