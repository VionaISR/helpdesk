import type { Session, UserRole } from '@/types';
import { SEED_ACCOUNTS } from '@/lib/account-store';
import { userStore } from '@/lib/user-store';
import { pics } from '@/lib/data';

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

export async function login(
  email: string,
  password: string,
): Promise<{ ok: true; session: Session } | { ok: false; error: string }> {
  const lower = email.toLowerCase().trim();

  if (!password) {
    return { ok: false, error: 'Email atau password salah. Coba lagi atau hubungi admin.' };
  }

  const seedAccount = SEED_ACCOUNTS.find(a => a.email.toLowerCase() === lower);
  const registered = userStore.findByEmail(lower);

  if (!seedAccount && !registered) {
    return { ok: false, error: 'Email atau password salah. Coba lagi atau hubungi admin.' };
  }

  const name = seedAccount?.name ?? registered!.name;
  const role: UserRole = (seedAccount?.role ?? registered!.role) as UserRole;
  const picRecord = pics.find(p => p.email.toLowerCase() === lower);

  const session: Session = {
    email: lower,
    name,
    role,
    picId: picRecord?.id ?? null,
    initials: picRecord?.initials ?? initialsFromName(name),
    loginAt: new Date().toISOString(),
  };

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
  if (isBrowser()) localStorage.removeItem(SESSION_KEY);
}

export function getRedirectUrl(role: UserRole): string {
  if (role === 'admin') return '/admin';
  if (role === 'pic') return '/pic';
  return '/dashboard';
}
