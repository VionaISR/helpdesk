import { supabase } from './supabase';

export interface CreateAccountInput {
  email: string;
  password: string;
  name: string;
  role: 'pic' | 'user';
  picId?: string;
  teamId?: string;
  dept?: string;
  initials?: string;
}

export interface UpdateAccountInput {
  email: string;
  newEmail?: string;
  newPassword?: string;
  name?: string;
}

type Result = { ok: true } | { ok: false; error: string };

async function call(method: string, body: unknown): Promise<Result> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token ?? '';
  const res = await fetch('/api/admin/accounts', {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: json.error || 'Permintaan gagal.' };
  return { ok: true };
}

export function adminCreateAccount(input: CreateAccountInput): Promise<Result> {
  return call('POST', input);
}

export function adminUpdateAccount(input: UpdateAccountInput): Promise<Result> {
  return call('PATCH', input);
}

export function adminDeleteAccount(email: string): Promise<Result> {
  return call('DELETE', { email });
}
