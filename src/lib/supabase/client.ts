import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

// The anon key is now a publishable key only — after signInWithPassword the
// same client carries the user's JWT on every request, so RLS (v6) enforces
// access. persistSession + autoRefreshToken keep the user logged in across
// reloads; detectSessionInUrl is off (no magic-link / OAuth redirect flow).
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});
