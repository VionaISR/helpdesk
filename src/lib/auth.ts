import type { Session, UserRole } from '@/types';
import { supabase } from '@/lib/supabase';

const SESSION_KEY = 'itlk_session';

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

export async function login(
  email: string,
  password: string,
): Promise<{ ok: true; session: Session } | { ok: false; error: string }> {
  const lower = email.toLowerCase().trim();

  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: lower,
    password,
  });

  if (authError) {
    const msg = authError.message.toLowerCase();
    if (msg.includes('invalid login') || msg.includes('invalid credentials')) {
      return { ok: false, error: 'Email atau password salah. Coba lagi atau hubungi admin.' };
    }
    return { ok: false, error: authError.message };
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('name, role, pic_id, team_id, initials')
    .eq('id', authData.user.id)
    .single();

  if (profileError || !profile) {
    await supabase.auth.signOut();
    return { ok: false, error: 'Profil akun tidak ditemukan. Hubungi admin IT.' };
  }

  const initials =
    profile.initials ||
    profile.name
      .split(/\s+/)
      .map((w: string) => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();

  const session: Session = {
    email: lower,
    name: profile.name,
    role: profile.role as UserRole,
    picId: profile.pic_id ?? null,
    initials,
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
  supabase.auth.signOut();
}

export function getRedirectUrl(role: UserRole): string {
  if (role === 'admin') return '/admin';
  if (role === 'pic') return '/pic';
  return '/dashboard';
}
