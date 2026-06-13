import { useCallback, useEffect, useState } from 'react';
import type { Team, PIC, Category, App, SlaRule, KBArticle } from '@/types';
import { supabase } from '@/lib/supabase/client';
import { SEED_ACCOUNTS } from '@/lib/account-store';

// ─── ROW <-> TYPE MAPPING ────────────────────────────────────────────────────
// Master data (teams, pics, categories, app_routing, sla_rules, kb_articles)
// now lives in Supabase. These interfaces describe the snake_case Postgres
// columns; the map* functions convert them to the camelCase app types.

interface TeamRow {
  id: string;
  name: string;
  head_pic_id: string | null;
  head_name: string | null;
  head_email: string | null;
  role: string | null;
}

interface PicRow {
  id: string;
  name: string;
  email: string | null;
  initials: string | null;
  team_id: string | null;
  is_head: boolean | null;
  sub_team: string | null;
}

interface CategoryRow {
  id: string;
  name: string;
  color: string | null;
}

interface AppRoutingRow {
  id: string;
  app_name: string;
  app_prefix: string | null;
  app_keywords: string[] | null;
  team_id: string | null;
  primary_pic_id: string | null;
}

interface SlaRuleRow {
  id: string;
  priority: string;
  target_hours: number;
  warning_percent: number;
}

interface KbArticleRow {
  id: string;
  title: string;
  body: string | null;
  category: string | null;
  is_published: boolean | null;
  views: number | null;
  updated_at: string | null;
  created_at: string | null;
}

function mapTeam(row: TeamRow, memberIds: string[]): Team {
  return {
    id: row.id,
    name: row.name,
    headId: row.head_pic_id ?? '',
    headName: row.head_name ?? '',
    headEmail: row.head_email ?? '',
    role: row.role ?? undefined,
    memberIds,
  };
}

function mapPic(row: PicRow): PIC {
  return {
    id: row.id,
    name: row.name,
    initials: row.initials ?? '',
    teamId: row.team_id ?? '',
    isHead: row.is_head ?? undefined,
    email: row.email ?? '',
    subTeam: row.sub_team ?? undefined,
  };
}

function mapCategory(row: CategoryRow): Category {
  return { id: row.id, name: row.name, color: row.color ?? '' };
}

function mapApp(row: AppRoutingRow): App {
  return {
    id: row.id,
    name: row.app_name,
    prefix: row.app_prefix ?? '',
    teamId: row.team_id,
    keywords: row.app_keywords ?? [],
    picId: row.primary_pic_id,
  };
}

function mapSlaRule(row: SlaRuleRow): SlaRule {
  return {
    id: row.id,
    priority: row.priority as SlaRule['priority'],
    targetHours: row.target_hours,
    warningPercent: row.warning_percent,
  };
}

function mapKbArticle(row: KbArticleRow): KBArticle {
  return {
    id: row.id,
    title: row.title,
    category: row.category ?? '',
    views: row.views ?? 0,
    updated: (row.updated_at ?? row.created_at ?? '').slice(0, 10),
    body: row.body ?? undefined,
    isPublished: row.is_published ?? undefined,
  };
}

function logError(action: string, error: { message: string } | null): void {
  if (error) console.error(`[master-data] ${action} failed:`, error.message);
}

export async function fetchMasterData(): Promise<{ teams: Team[]; pics: PIC[]; categories: Category[]; apps: App[]; slaRules: SlaRule[]; kbArticles: KBArticle[] }> {
  const [teamsRes, picsRes, categoriesRes, appsRes, slaRes, kbRes] = await Promise.all([
    supabase.from('teams').select('*'),
    supabase.from('pics').select('*'),
    supabase.from('categories').select('*'),
    supabase.from('app_routing').select('*').order('created_at'),
    supabase.from('sla_rules').select('*'),
    supabase.from('kb_articles').select('*').order('created_at'),
  ]);

  logError('fetch teams', teamsRes.error);
  logError('fetch pics', picsRes.error);
  logError('fetch categories', categoriesRes.error);
  logError('fetch app_routing', appsRes.error);
  logError('fetch sla_rules', slaRes.error);
  logError('fetch kb_articles', kbRes.error);

  const pics = ((picsRes.data ?? []) as PicRow[]).map(mapPic);
  const teams = ((teamsRes.data ?? []) as TeamRow[]).map(row =>
    mapTeam(row, pics.filter(p => p.teamId === row.id).map(p => p.id))
  );

  return {
    teams,
    pics,
    categories: ((categoriesRes.data ?? []) as CategoryRow[]).map(mapCategory),
    apps: ((appsRes.data ?? []) as AppRoutingRow[]).map(mapApp),
    slaRules: ((slaRes.data ?? []) as SlaRuleRow[]).map(mapSlaRule),
    kbArticles: ((kbRes.data ?? []) as KbArticleRow[]).map(mapKbArticle),
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

// ─── APP USERS (akun terdaftar via Admin > Import Pengguna) ─────────────────

interface AppUserRow {
  id: string;
  email: string;
  name: string;
  dept: string | null;
  role: string;
  team_id: string | null;
  default_password: string;
  registered_at: string;
  email_sent: boolean | null;
}

export interface AppUser {
  id: string;
  email: string;
  name: string;
  dept: string | null;
  role: 'user' | 'pic';
  teamId: string | null;
  defaultPassword: string;
  registeredAt: string;
  emailSent: boolean;
}

function mapAppUser(row: AppUserRow): AppUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    dept: row.dept,
    role: row.role as AppUser['role'],
    teamId: row.team_id,
    defaultPassword: row.default_password,
    registeredAt: row.registered_at,
    emailSent: row.email_sent ?? false,
  };
}

export async function fetchAppUsers(): Promise<AppUser[]> {
  const { data, error } = await supabase.from('app_users').select('*');
  logError('fetchAppUsers', error);
  return ((data ?? []) as AppUserRow[]).map(mapAppUser);
}

export async function findAppUserByEmail(email: string): Promise<AppUser | null> {
  const { data, error } = await supabase.from('app_users').select('*').ilike('email', email).maybeSingle();
  logError('findAppUserByEmail', error);
  return data ? mapAppUser(data as AppUserRow) : null;
}

export async function insertAppUser(input: { id: string; email: string; name: string; dept?: string | null; role: 'user' | 'pic'; teamId?: string | null; defaultPassword: string }): Promise<void> {
  const { error } = await supabase.from('app_users').insert({
    id: input.id,
    email: input.email,
    name: input.name,
    dept: input.dept ?? null,
    role: input.role,
    team_id: input.teamId ?? null,
    default_password: input.defaultPassword,
    registered_at: new Date().toISOString(),
    email_sent: false,
  });
  logError('insertAppUser', error);
}

export async function updateAppUser(email: string, patch: { email?: string; name?: string; defaultPassword?: string }): Promise<void> {
  const row: Record<string, string> = {};
  if (patch.email !== undefined) row.email = patch.email;
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.defaultPassword !== undefined) row.default_password = patch.defaultPassword;
  if (Object.keys(row).length === 0) return;
  const { error } = await supabase.from('app_users').update(row).ilike('email', email);
  logError('updateAppUser', error);
}

export async function deleteAppUser(email: string): Promise<void> {
  const { error } = await supabase.from('app_users').delete().ilike('email', email);
  logError('deleteAppUser', error);
}

export async function markAppUserEmailSent(email: string): Promise<void> {
  const { error } = await supabase.from('app_users').update({ email_sent: true }).ilike('email', email);
  logError('markAppUserEmailSent', error);
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

  const appUsers = await fetchAppUsers();
  const registered: UserProfile[] = appUsers
    .filter(u => u.role === 'user')
    .map(u => ({ id: u.id, email: u.email, name: u.name, dept: u.dept, createdAt: u.registeredAt }));

  return [...seedUsers, ...registered].sort((a, b) => a.name.localeCompare(b.name));
}

// ─── PIC CRUD ────────────────────────────────────────────────────────────────

export async function createPic(input: { id: string; name: string; email: string; initials: string }): Promise<void> {
  const { error } = await supabase.from('pics').insert({
    id: input.id, name: input.name, email: input.email, initials: input.initials, team_id: null,
  });
  logError('createPic', error);
}

export async function updatePic(id: string, input: { name?: string; email?: string; initials?: string }): Promise<void> {
  const patch: Record<string, string> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.email !== undefined) patch.email = input.email;
  if (input.initials !== undefined) patch.initials = input.initials;
  if (Object.keys(patch).length === 0) return;
  const { error } = await supabase.from('pics').update(patch).eq('id', id);
  logError('updatePic', error);
}

export async function deactivatePic(id: string): Promise<void> {
  const { error } = await supabase.from('pics').delete().eq('id', id);
  logError('deactivatePic', error);
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
  const { error } = await supabase.from('categories').insert({ id: input.id, name: input.name, color: input.color });
  logError('createCategory', error);
}

export async function updateCategory(id: string, input: { name?: string; color?: string }): Promise<void> {
  const patch: Record<string, string> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.color !== undefined) patch.color = input.color;
  if (Object.keys(patch).length === 0) return;
  const { error } = await supabase.from('categories').update(patch).eq('id', id);
  logError('updateCategory', error);
}

export async function deleteCategory(id: string): Promise<void> {
  const { error } = await supabase.from('categories').delete().eq('id', id);
  logError('deleteCategory', error);
}

// ─── APP / ROUTING CRUD ──────────────────────────────────────────────────────

export async function createApp(input: { name: string; prefix: string; keywords: string[] }): Promise<void> {
  const { error } = await supabase.from('app_routing').insert({
    app_name: input.name, app_prefix: input.prefix, app_keywords: input.keywords, team_id: null,
  });
  logError('createApp', error);
}

export async function updateApp(id: string, input: { name: string; prefix: string }): Promise<void> {
  const { error } = await supabase.from('app_routing').update({ app_name: input.name, app_prefix: input.prefix }).eq('id', id);
  logError('updateApp', error);
}

export async function deleteApp(id: string): Promise<void> {
  const { error } = await supabase.from('app_routing').delete().eq('id', id);
  logError('deleteApp', error);
}

export async function setAppPic(id: string, picId: string | null): Promise<void> {
  const { error } = await supabase.from('app_routing').update({ primary_pic_id: picId }).eq('id', id);
  logError('setAppPic', error);
}

// ─── SLA RULES CRUD ──────────────────────────────────────────────────────────

export async function updateSlaRule(id: string, input: { targetHours?: number; warningPercent?: number }): Promise<void> {
  const patch: Record<string, number> = {};
  if (input.targetHours !== undefined) patch.target_hours = input.targetHours;
  if (input.warningPercent !== undefined) patch.warning_percent = input.warningPercent;
  if (Object.keys(patch).length === 0) return;
  const { error } = await supabase.from('sla_rules').update(patch).eq('id', id);
  logError('updateSlaRule', error);
}

// ─── KNOWLEDGE BASE CRUD ─────────────────────────────────────────────────────

export async function createKbArticle(input: { title: string; category: string; body: string; isPublished: boolean }): Promise<void> {
  const { error } = await supabase.from('kb_articles').insert({
    title: input.title, category: input.category, body: input.body, is_published: input.isPublished, views: 0,
  });
  logError('createKbArticle', error);
}

export async function updateKbArticle(id: string, input: { title?: string; category?: string; body?: string; isPublished?: boolean }): Promise<void> {
  const patch: Record<string, string | boolean> = {};
  if (input.title !== undefined) patch.title = input.title;
  if (input.category !== undefined) patch.category = input.category;
  if (input.body !== undefined) patch.body = input.body;
  if (input.isPublished !== undefined) patch.is_published = input.isPublished;
  if (Object.keys(patch).length === 0) return;
  const { error } = await supabase.from('kb_articles').update(patch).eq('id', id);
  logError('updateKbArticle', error);
}

export async function deleteKbArticle(id: string): Promise<void> {
  const { error } = await supabase.from('kb_articles').delete().eq('id', id);
  logError('deleteKbArticle', error);
}
