import { userStore } from './user-store';
import { SEED_ACCOUNTS } from './account-store';

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

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

function emailExists(email: string): boolean {
  const lower = email.toLowerCase();
  return SEED_ACCOUNTS.some(a => a.email.toLowerCase() === lower)
    || userStore.getAll().some(u => u.email.toLowerCase() === lower);
}

export async function adminCreateAccount(input: CreateAccountInput): Promise<Result> {
  if (emailExists(input.email)) {
    return { ok: false, error: 'Email sudah terdaftar.' };
  }

  if (isBrowser()) {
    userStore.addMany([{
      id: `u-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      email: input.email,
      name: input.name,
      dept: input.dept ?? '',
      role: input.role,
      teamId: input.teamId,
      defaultPassword: input.password,
      registeredAt: new Date().toISOString(),
      emailSent: false,
    }]);
  }

  return { ok: true };
}

export async function adminUpdateAccount(input: UpdateAccountInput): Promise<Result> {
  const lower = input.email.toLowerCase();
  const registered = userStore.findByEmail(input.email);

  if (registered) {
    const all = userStore.getAll();
    const idx = all.findIndex(u => u.email.toLowerCase() === lower);
    all[idx] = {
      ...all[idx],
      ...(input.name ? { name: input.name } : {}),
      ...(input.newEmail ? { email: input.newEmail } : {}),
      ...(input.newPassword ? { defaultPassword: input.newPassword } : {}),
    };
    if (isBrowser()) localStorage.setItem(userStore.KEY, JSON.stringify(all));
    return { ok: true };
  }

  const isSeed = SEED_ACCOUNTS.some(a => a.email.toLowerCase() === lower);
  if (isSeed && input.newEmail && input.newEmail.toLowerCase() !== lower) {
    return { ok: false, error: 'Email login akun bawaan sistem tidak bisa diubah pada mode prototype ini.' };
  }

  return { ok: true };
}

export async function adminDeleteAccount(email: string): Promise<Result> {
  const lower = email.toLowerCase();
  if (SEED_ACCOUNTS.some(a => a.email.toLowerCase() === lower)) {
    return { ok: false, error: 'Akun bawaan sistem tidak bisa dihapus.' };
  }
  if (isBrowser()) userStore.remove(email);
  return { ok: true };
}
