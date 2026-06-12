export interface SeedAccount {
  email: string;
  role: 'admin' | 'pic' | 'user';
  name: string;
  picId?: string | null;
  dept?: string;
  teamId?: string;
  createdAt: string;
}

export const SEED_ACCOUNTS: SeedAccount[] = [
  // ── Admin
  { email: 'lady.yohana@lippo.id',       role: 'admin', name: 'Lady Yohana',       picId: 'p-lady',      createdAt: '2026-01-01T00:00:00.000Z' },
  { email: 'eric.yonalis@lippo.id',       role: 'admin', name: 'Eric Yonalis',       picId: 'p-eric',      createdAt: '2026-01-01T00:00:00.000Z' },
  { email: 'viona@lippo.id',              role: 'admin', name: 'Viona',              picId: 'p-vio',       createdAt: '2026-01-01T00:00:00.000Z' },
  // ── PIC
  { email: 'license.admin@lippo.id',      role: 'pic',   name: 'License Admin',      picId: 'p-license',   teamId: 'team-license',   createdAt: '2026-01-01T00:00:00.000Z' },
  { email: 'ivan.tenusa@lippo.id',        role: 'pic',   name: 'Ivan Tenusa',        picId: 'p-ivan',      teamId: 'team-ivan',      createdAt: '2026-01-01T00:00:00.000Z' },
  { email: 'apri@lippo.id',              role: 'pic',   name: 'Apri',              picId: 'p-apri',      teamId: 'team-ivan',      createdAt: '2026-01-01T00:00:00.000Z' },
  { email: 'kevin@lippo.id',             role: 'pic',   name: 'Kevin',             picId: 'p-kevin',     teamId: 'team-ivan',      createdAt: '2026-01-01T00:00:00.000Z' },
  { email: 'lukas.wijaya@lippo.id',       role: 'pic',   name: 'Lukas Wijaya K',    picId: 'p-lukas',     teamId: 'team-ivan',      createdAt: '2026-01-01T00:00:00.000Z' },
  { email: 'nicholas.suryatama@lippo.id', role: 'pic',   name: 'Nicholas Suryatama', picId: 'p-nicholas',  teamId: 'team-nicholas',  createdAt: '2026-01-01T00:00:00.000Z' },
  { email: 'leonagata@lippo.id',          role: 'pic',   name: 'Leonagata',          picId: 'p-leo',       teamId: 'team-nicholas',  createdAt: '2026-01-01T00:00:00.000Z' },
  { email: 'joshua.kartono@lippo.id',     role: 'pic',   name: 'Joshua Kartono',     picId: 'p-joshua',    teamId: 'team-joshua',    createdAt: '2026-01-01T00:00:00.000Z' },
  { email: 'christian@lippo.id',          role: 'pic',   name: 'Christian',          picId: 'p-christian', teamId: 'team-joshua',    createdAt: '2026-01-01T00:00:00.000Z' },
  { email: 'andika@lippoland.id',         role: 'pic',   name: 'Rachmad Andika',     picId: 'p-andika',    teamId: 'team-andika',    createdAt: '2026-01-01T00:00:00.000Z' },
  // ── User
  { email: 'andi.pratama@lippo.id',       role: 'user',  name: 'Andi Pratama',       dept: 'Finance',      createdAt: '2026-01-01T00:00:00.000Z' },
  { email: 'dewi.l@lippo.id',             role: 'user',  name: 'Dewi Lestari',       dept: 'Operations',   createdAt: '2026-01-01T00:00:00.000Z' },
];
