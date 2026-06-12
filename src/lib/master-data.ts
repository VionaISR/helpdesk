import { useCallback, useEffect, useState } from 'react';
import type { Team, PIC, Category, App, SlaRule, KBArticle } from '@/types';
import {
  teams as seedTeams,
  pics as seedPics,
  categories as seedCategories,
  apps as seedApps,
  slaRules as seedSlaRules,
  kbArticles as seedKbArticles,
} from '@/lib/data';
import { SEED_ACCOUNTS } from '@/lib/account-store';
import { userStore } from '@/lib/user-store';

const KEYS = {
  pics: 'helpdesk_pics',
  categories: 'helpdesk_categories',
  apps: 'helpdesk_apps',
  slaRules: 'helpdesk_sla_rules',
  kbArticles: 'helpdesk_kb_articles',
};

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

function loadStore<T>(key: string, seed: T[]): T[] {
  if (!isBrowser()) return JSON.parse(JSON.stringify(seed));
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as T[];
  } catch { /* ignore */ }
  const seeded = JSON.parse(JSON.stringify(seed)) as T[];
  localStorage.setItem(key, JSON.stringify(seeded));
  return seeded;
}

function saveStore<T>(key: string, items: T[]): void {
  if (!isBrowser()) return;
  localStorage.setItem(key, JSON.stringify(items));
}

function slugifyAppName(name: string): string {
  return 'app-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function seedAppsWithIds(): App[] {
  return seedApps.map(a => ({ ...a, id: a.id ?? slugifyAppName(a.name) }));
}

export async function fetchMasterData(): Promise<{ teams: Team[]; pics: PIC[]; categories: Category[]; apps: App[]; slaRules: SlaRule[]; kbArticles: KBArticle[] }> {
  const pics = loadStore(KEYS.pics, seedPics);
  const teams = seedTeams.map(t => ({
    ...t,
    memberIds: pics.filter(p => p.teamId === t.id).map(p => p.id),
  }));

  return {
    teams,
    pics,
    categories: loadStore(KEYS.categories, seedCategories),
    apps: loadStore(KEYS.apps, seedAppsWithIds()),
    slaRules: loadStore(KEYS.slaRules, seedSlaRules),
    kbArticles: loadStore(KEYS.kbArticles, seedKbArticles),
  };
}

export function useMasterData() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [pics, setPics] = useState<PIC[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [apps, setApps] = useState<App[]>([]);
  const [slaRules, setSlaRules] = useState<SlaRule[]>([]);
  const [kbArticles, setKbArticles] = useState<KBArticle[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const data = await fetchMasterData();
    setTeams(data.teams);
    setPics(data.pics);
    setCategories(data.categories);
    setApps(data.apps);
    setSlaRules(data.slaRules);
    setKbArticles(data.kbArticles);
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return { teams, pics, categories, apps, slaRules, kbArticles, loading, refresh };
}

// ─── USER PROFILES (Karyawan terdaftar, role='user') ────────────────────────

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  dept: string | null;
  createdAt: string;
}

export async function fetchUserProfiles(): Promise<UserProfile[]> {
  const seedUsers: UserProfile[] = SEED_ACCOUNTS
    .filter(a => a.role === 'user')
    .map(a => ({ id: a.email, email: a.email, name: a.name, dept: a.dept ?? null, createdAt: a.createdAt }));

  const registered: UserProfile[] = userStore.getAll()
    .filter(u => u.role === 'user')
    .map(u => ({ id: u.id, email: u.email, name: u.name, dept: u.dept ?? null, createdAt: u.registeredAt }));

  return [...seedUsers, ...registered].sort((a, b) => a.name.localeCompare(b.name));
}

// ─── PIC CRUD ────────────────────────────────────────────────────────────────

export async function createPic(input: { id: string; name: string; email: string; initials: string }): Promise<void> {
  const all = loadStore(KEYS.pics, seedPics);
  all.push({ id: input.id, name: input.name, email: input.email, initials: input.initials, teamId: '' });
  saveStore(KEYS.pics, all);
}

export async function updatePic(id: string, input: { name?: string; email?: string; initials?: string }): Promise<void> {
  const all = loadStore(KEYS.pics, seedPics);
  const idx = all.findIndex(p => p.id === id);
  if (idx < 0) return;
  all[idx] = { ...all[idx], ...input };
  saveStore(KEYS.pics, all);
}

export async function deactivatePic(id: string): Promise<void> {
  const all = loadStore(KEYS.pics, seedPics);
  saveStore(KEYS.pics, all.filter(p => p.id !== id));
}

// ─── CATEGORY CRUD ───────────────────────────────────────────────────────────

export const COLOR_PALETTE = [
  '#0891b2', '#7c3aed', '#9333ea', '#16a34a', '#ca8a04',
  '#dc2626', '#64748b', '#2563eb', '#c2410c', '#475569',
];

export function nextColor(usedCount: number): string {
  return COLOR_PALETTE[usedCount % COLOR_PALETTE.length];
}

export async function createCategory(input: { id: string; name: string; color: string }): Promise<void> {
  const all = loadStore(KEYS.categories, seedCategories);
  all.push({ id: input.id, name: input.name, color: input.color });
  saveStore(KEYS.categories, all);
}

export async function updateCategory(id: string, input: { name?: string; color?: string }): Promise<void> {
  const all = loadStore(KEYS.categories, seedCategories);
  const idx = all.findIndex(c => c.id === id);
  if (idx < 0) return;
  all[idx] = { ...all[idx], ...input };
  saveStore(KEYS.categories, all);
}

export async function deleteCategory(id: string): Promise<void> {
  const all = loadStore(KEYS.categories, seedCategories);
  saveStore(KEYS.categories, all.filter(c => c.id !== id));
}

// ─── APP / ROUTING CRUD ──────────────────────────────────────────────────────

export async function createApp(input: { name: string; prefix: string; keywords: string[] }): Promise<void> {
  const all = loadStore(KEYS.apps, seedAppsWithIds());
  const id = `${slugifyAppName(input.name)}-${Date.now().toString(36)}`;
  all.push({ id, name: input.name, prefix: input.prefix, teamId: null, keywords: input.keywords });
  saveStore(KEYS.apps, all);
}

export async function updateApp(id: string, input: { name: string; prefix: string }): Promise<void> {
  const all = loadStore(KEYS.apps, seedAppsWithIds());
  const idx = all.findIndex(a => a.id === id);
  if (idx < 0) return;
  all[idx] = { ...all[idx], name: input.name, prefix: input.prefix };
  saveStore(KEYS.apps, all);
}

export async function deleteApp(id: string): Promise<void> {
  const all = loadStore(KEYS.apps, seedAppsWithIds());
  saveStore(KEYS.apps, all.filter(a => a.id !== id));
}

export async function setAppPic(id: string, picId: string | null): Promise<void> {
  const all = loadStore(KEYS.apps, seedAppsWithIds());
  const idx = all.findIndex(a => a.id === id);
  if (idx < 0) return;
  all[idx] = { ...all[idx], picId };
  saveStore(KEYS.apps, all);
}

// ─── SLA RULES CRUD ──────────────────────────────────────────────────────────

export async function updateSlaRule(id: string, input: { targetHours?: number; warningPercent?: number }): Promise<void> {
  const all = loadStore(KEYS.slaRules, seedSlaRules);
  const idx = all.findIndex(r => r.id === id);
  if (idx < 0) return;
  all[idx] = { ...all[idx], ...input };
  saveStore(KEYS.slaRules, all);
}

// ─── KNOWLEDGE BASE CRUD ─────────────────────────────────────────────────────

export async function createKbArticle(input: { title: string; category: string; body: string; isPublished: boolean }): Promise<void> {
  const all = loadStore(KEYS.kbArticles, seedKbArticles);
  all.push({
    id: `kb-${Date.now().toString(36)}`,
    title: input.title,
    category: input.category,
    views: 0,
    updated: new Date().toISOString().slice(0, 10),
    body: input.body,
    isPublished: input.isPublished,
  });
  saveStore(KEYS.kbArticles, all);
}

export async function updateKbArticle(id: string, input: { title?: string; category?: string; body?: string; isPublished?: boolean }): Promise<void> {
  const all = loadStore(KEYS.kbArticles, seedKbArticles);
  const idx = all.findIndex(a => a.id === id);
  if (idx < 0) return;
  all[idx] = { ...all[idx], ...input, updated: new Date().toISOString().slice(0, 10) };
  saveStore(KEYS.kbArticles, all);
}

export async function deleteKbArticle(id: string): Promise<void> {
  const all = loadStore(KEYS.kbArticles, seedKbArticles);
  saveStore(KEYS.kbArticles, all.filter(a => a.id !== id));
}
