import { supabase } from '@/lib/supabase/client';

// Account management now goes through /api/admin/users — creating, renaming, or
// deleting a login touches auth.users, which requires the service-role key
// (server-only). These functions are thin authenticated wrappers; the route
// itself re-verifies the caller is an admin.

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

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function callUsersApi(method: 'POST' | 'PATCH' | 'DELETE', body: unknown): Promise<Result> {
  try {
    const res = await fetch('/api/admin/users', {
      method,
      headers: await authHeaders(),
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) return { ok: false, error: json.error ?? 'Operasi gagal.' };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Operasi gagal.' };
  }
}

export async function adminCreateAccount(input: CreateAccountInput): Promise<Result> {
  return callUsersApi('POST', input);
}

export async function adminUpdateAccount(input: UpdateAccountInput): Promise<Result> {
  return callUsersApi('PATCH', input);
}

export async function adminDeleteAccount(email: string): Promise<Result> {
  return callUsersApi('DELETE', { email });
}
