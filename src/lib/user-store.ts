export interface RegisteredUser {
  id: string;
  email: string;
  name: string;
  dept: string;
  role: 'user' | 'pic';
  teamId?: string;
  defaultPassword: string;
  registeredAt: string;
  emailSent: boolean;
}

const KEY = 'itlk_registered_users';

function isBrowser() { return typeof window !== 'undefined'; }

export const userStore = {
  getAll(): RegisteredUser[] {
    if (!isBrowser()) return [];
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? (JSON.parse(raw) as RegisteredUser[]) : [];
    } catch { return []; }
  },

  addMany(users: RegisteredUser[]): void {
    if (!isBrowser()) return;
    const existing = this.getAll();
    const emailSet = new Set(existing.map(u => u.email.toLowerCase()));
    const newOnes = users.filter(u => !emailSet.has(u.email.toLowerCase()));
    localStorage.setItem(KEY, JSON.stringify([...existing, ...newOnes]));
  },

  findByEmail(email: string): RegisteredUser | null {
    return this.getAll().find(u => u.email.toLowerCase() === email.toLowerCase()) ?? null;
  },

  markEmailSent(email: string): void {
    if (!isBrowser()) return;
    const all = this.getAll().map(u =>
      u.email.toLowerCase() === email.toLowerCase() ? { ...u, emailSent: true } : u
    );
    localStorage.setItem(KEY, JSON.stringify(all));
  },

  remove(email: string): void {
    if (!isBrowser()) return;
    localStorage.setItem(KEY, JSON.stringify(this.getAll().filter(u => u.email.toLowerCase() !== email.toLowerCase())));
  },

  KEY,
};

export function generateDefaultPassword(name: string): string {
  const base = name.replace(/\s+/g, '').slice(0, 5);
  return `IT@${base}2026`;
}
