import type { Session, UserRole } from '@/types';
import { supabase } from '@/lib/supabase/client';

const SESSION_KEY = 'itlk_session';

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

function initialsFromName(name: string): string {
  return name
    .split(/\s+/)
    .map(w => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

// App-specific identity stored in auth.users.user_metadata at provisioning /
// account creation (see scripts/provision-auth.mjs and the admin create-user
// API route). profiles holds the canonical copy used by RLS.
interface AppMetadata {
  role?: UserRole;
  name?: string;
  pic_id?: string | null;
  dept?: string | null;
}

export async function login(
  email: string,
  password: string,
): Promise<{ ok: true; session: Session } | { ok: false; error: string }> {
  const lower = email.toLowerCase().trim();

  if (!password) {
    return { ok: false, error: 'Email atau password salah. Coba lagi atau hubungi admin.' };
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email: lower, password });
  if (error || !data.user) {
    // Generic error — don't reveal whether the email exists.
    return { ok: false, error: 'Email atau password salah. Coba lagi atau hubungi admin.' };
  }

  const meta = (data.user.user_metadata ?? {}) as AppMetadata;
  const role: UserRole = (meta.role ?? 'user') as UserRole;
  const name = meta.name ?? data.user.email ?? lower;

  const session: Session = {
    email: data.user.email ?? lower,
    name,
    role,
    picId: meta.pic_id ?? null,
    initials: initialsFromName(name),
    loginAt: new Date().toISOString(),
  };

  // Cache for the synchronous getSession() guards across pages. This is a UI
  // convenience only — real enforcement is the Supabase JWT + RLS, so a forged
  // cache can't read or write protected data.
  if (isBrowser()) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }

  return { ok: true, session };
}

export function getSession(): Session | null {
  if (!isBrowser()) return null;
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null') as Session | null;
  } catch {
    return null;
  }
}

export function logout(): void {
  // Clear the UI cache synchronously so guards redirect immediately, then tear
  // down the Supabase token in the background.
  if (isBrowser()) localStorage.removeItem(SESSION_KEY);
  void supabase.auth.signOut();
}

// Re-hydrate (or clear) the cached session from the live Supabase auth state.
// Optional helper — call once on app mount to keep itlk_session in sync with
// token refresh / expiry. Returns the resulting session (or null).
export async function syncSession(): Promise<Session | null> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    if (isBrowser()) localStorage.removeItem(SESSION_KEY);
    return null;
  }
  const meta = (data.user.user_metadata ?? {}) as AppMetadata;
  const role: UserRole = (meta.role ?? 'user') as UserRole;
  const name = meta.name ?? data.user.email ?? '';
  const session: Session = {
    email: data.user.email ?? '',
    name,
    role,
    picId: meta.pic_id ?? null,
    initials: initialsFromName(name),
    loginAt: getSession()?.loginAt ?? new Date().toISOString(),
  };
  if (isBrowser()) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

export function getRedirectUrl(role: UserRole): string {
  if (role === 'admin') return '/admin';
  if (role === 'pic') return '/pic';
  return '/dashboard';
}
