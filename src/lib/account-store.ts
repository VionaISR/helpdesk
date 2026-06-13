export interface SeedAccount {
  email: string;
  role: 'admin' | 'pic' | 'user';
  name: string;
  picId?: string | null;
  dept?: string;
  teamId?: string;
  createdAt: string;
  /** Optional per-account override; falls back to SEED_DEFAULT_PASSWORD. */
  password?: string;
}

// Password the 14 built-in accounts log in with. Overridable per-deploy via
// NEXT_PUBLIC_SEED_PASSWORD. Unlike app_users (which carry their own
// default_password), these accounts have no DB row, so the credential lives
// here. Change this — and tell your team — before any non-local use.
export const SEED_DEFAULT_PASSWORD =
  process.env.NEXT_PUBLIC_SEED_PASSWORD || 'ithelpdesk2026';

export const SEED_ACCOUNTS: SeedAccount[] = [
  // ── Admin
  { email: 'lady.yohana@ithelpdesk.com',       role: 'admin', name: 'Lady Yohana',       picId: 'p-lady',      createdAt: '2026-01-01T00:00:00.000Z' },
  { email: 'eric.yonalis@ithelpdesk.com',       role: 'admin', name: 'Eric Yonalis',       picId: 'p-eric',      createdAt: '2026-01-01T00:00:00.000Z' },
  { email: 'viona@ithelpdesk.com',              role: 'admin', name: 'Viona',              picId: 'p-vio',       createdAt: '2026-01-01T00:00:00.000Z' },
  // ── PIC
  { email: 'license.admin@ithelpdesk.com',      role: 'pic',   name: 'License Admin',      picId: 'p-license',   teamId: 'team-license',   createdAt: '2026-01-01T00:00:00.000Z' },
  { email: 'ivan.tenusa@ithelpdesk.com',        role: 'pic',   name: 'Ivan Tenusa',        picId: 'p-ivan',      teamId: 'team-ivan',      createdAt: '2026-01-01T00:00:00.000Z' },
  { email: 'apri@ithelpdesk.com',              role: 'pic',   name: 'Apri',              picId: 'p-apri',      teamId: 'team-ivan',      createdAt: '2026-01-01T00:00:00.000Z' },
  { email: 'kevin@ithelpdesk.com',             role: 'pic',   name: 'Kevin',             picId: 'p-kevin',     teamId: 'team-ivan',      createdAt: '2026-01-01T00:00:00.000Z' },
  { email: 'lukas.wijaya@ithelpdesk.com',       role: 'pic',   name: 'Lukas Wijaya K',    picId: 'p-lukas',     teamId: 'team-ivan',      createdAt: '2026-01-01T00:00:00.000Z' },
  { email: 'nicholas.suryatama@ithelpdesk.com', role: 'pic',   name: 'Nicholas Suryatama', picId: 'p-nicholas',  teamId: 'team-nicholas',  createdAt: '2026-01-01T00:00:00.000Z' },
  { email: 'leonagata@ithelpdesk.com',          role: 'pic',   name: 'Leonagata',          picId: 'p-leo',       teamId: 'team-nicholas',  createdAt: '2026-01-01T00:00:00.000Z' },
  { email: 'joshua.kartono@ithelpdesk.com',     role: 'pic',   name: 'Joshua Kartono',     picId: 'p-joshua',    teamId: 'team-joshua',    createdAt: '2026-01-01T00:00:00.000Z' },
  { email: 'christian@ithelpdesk.com',          role: 'pic',   name: 'Christian',          picId: 'p-christian', teamId: 'team-joshua',    createdAt: '2026-01-01T00:00:00.000Z' },
  { email: 'andika@ithelpdesk.com',             role: 'pic',   name: 'Rachmad Andika',     picId: 'p-andika',    teamId: 'team-andika',    createdAt: '2026-01-01T00:00:00.000Z' },
  // ── User
  { email: 'andi.pratama@ithelpdesk.com',       role: 'user',  name: 'Andi Pratama',       dept: 'Finance',      createdAt: '2026-01-01T00:00:00.000Z' },
  { email: 'dewi.l@ithelpdesk.com',             role: 'user',  name: 'Dewi Lestari',       dept: 'Operations',   createdAt: '2026-01-01T00:00:00.000Z' },
];
