import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Team, PIC, Category, App, SlaRule, KBArticle } from '@/types';

interface TeamRow {
  id: string;
  name: string;
  head_pic_id: string | null;
  head_name: string | null;
  head_email: string | null;
}

interface PicRow {
  id: string;
  name: string;
  email: string | null;
  team_id: string | null;
  is_active: boolean;
  initials: string | null;
  sub_team: string | null;
}

interface CategoryRow {
  id: string;
  name: string;
  color: string;
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
  is_published: boolean;
  views: number;
  updated_at: string;
}

function mapTeams(teamRows: TeamRow[], picRows: PicRow[]): Team[] {
  return teamRows.map(t => ({
    id: t.id,
    name: t.name,
    headId: t.head_pic_id ?? '',
    headName: t.head_name ?? '',
    headEmail: t.head_email ?? '',
    memberIds: picRows.filter(p => p.team_id === t.id).map(p => p.id),
  }));
}

function mapPics(picRows: PicRow[], teamRows: TeamRow[]): PIC[] {
  return picRows.map(p => ({
    id: p.id,
    name: p.name,
    initials: p.initials ?? '',
    teamId: p.team_id ?? '',
    isHead: teamRows.some(t => t.head_pic_id === p.id),
    email: p.email ?? '',
    subTeam: p.sub_team ?? undefined,
  }));
}

function mapCategories(catRows: CategoryRow[]): Category[] {
  return catRows.map(c => ({ id: c.id, name: c.name, color: c.color }));
}

function mapApps(rows: AppRoutingRow[]): App[] {
  return rows.map(r => ({
    id: r.id,
    name: r.app_name,
    prefix: r.app_prefix ?? '',
    teamId: r.team_id,
    keywords: r.app_keywords ?? [],
    picId: r.primary_pic_id,
  }));
}

function mapSlaRules(rows: SlaRuleRow[]): SlaRule[] {
  return rows.map(r => ({
    id: r.id,
    priority: r.priority as SlaRule['priority'],
    targetHours: r.target_hours,
    warningPercent: r.warning_percent,
  }));
}

function mapKbArticles(rows: KbArticleRow[]): KBArticle[] {
  return rows.map(r => ({
    id: r.id,
    title: r.title,
    category: r.category ?? '',
    views: r.views,
    updated: r.updated_at,
    body: r.body ?? '',
    isPublished: r.is_published,
  }));
}

export async function fetchMasterData(): Promise<{ teams: Team[]; pics: PIC[]; categories: Category[]; apps: App[]; slaRules: SlaRule[]; kbArticles: KBArticle[] }> {
  const [teamsRes, picsRes, categoriesRes, appsRes, slaRes, kbRes] = await Promise.all([
    supabase.from('teams').select('*').order('name'),
    supabase.from('pics').select('*').eq('is_active', true).order('name'),
    supabase.from('categories').select('*').order('id'),
    supabase.from('app_routing').select('*').order('app_name'),
    supabase.from('sla_rules').select('*').order('target_hours'),
    supabase.from('kb_articles').select('*').order('updated_at', { ascending: false }),
  ]);
  if (teamsRes.error) throw teamsRes.error;
  if (picsRes.error) throw picsRes.error;
  if (categoriesRes.error) throw categoriesRes.error;
  if (appsRes.error) throw appsRes.error;
  if (slaRes.error) throw slaRes.error;
  if (kbRes.error) throw kbRes.error;

  const teamRows = teamsRes.data as TeamRow[];
  const picRows = picsRes.data as PicRow[];

  return {
    teams: mapTeams(teamRows, picRows),
    pics: mapPics(picRows, teamRows),
    categories: mapCategories(categoriesRes.data as CategoryRow[]),
    apps: mapApps(appsRes.data as AppRoutingRow[]),
    slaRules: mapSlaRules(slaRes.data as SlaRuleRow[]),
    kbArticles: mapKbArticles(kbRes.data as KbArticleRow[]),
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
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, name, dept, created_at')
    .eq('role', 'user')
    .order('name');
  if (error) throw error;
  return (data ?? []).map(r => ({ id: r.id, email: r.email, name: r.name, dept: r.dept, createdAt: r.created_at }));
}

// ─── PIC CRUD ────────────────────────────────────────────────────────────────

export async function createPic(input: { id: string; name: string; email: string; initials: string }): Promise<void> {
  const { error } = await supabase.from('pics').insert({
    id: input.id, name: input.name, email: input.email, initials: input.initials, team_id: null,
  });
  if (error) throw error;
}

export async function updatePic(id: string, input: { name?: string; email?: string; initials?: string }): Promise<void> {
  const { error } = await supabase.from('pics').update(input).eq('id', id);
  if (error) throw error;
}

export async function deactivatePic(id: string): Promise<void> {
  const { error } = await supabase.from('pics').update({ is_active: false }).eq('id', id);
  if (error) throw error;
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
  const { error } = await supabase.from('categories').insert(input);
  if (error) throw error;
}

export async function updateCategory(id: string, input: { name?: string; color?: string }): Promise<void> {
  const { error } = await supabase.from('categories').update(input).eq('id', id);
  if (error) throw error;
}

export async function deleteCategory(id: string): Promise<void> {
  const { error } = await supabase.from('categories').delete().eq('id', id);
  if (error) throw error;
}

// ─── APP / ROUTING CRUD ──────────────────────────────────────────────────────

export async function createApp(input: { name: string; prefix: string; keywords: string[] }): Promise<void> {
  const { error } = await supabase.from('app_routing').insert({
    app_name: input.name, app_prefix: input.prefix, app_keywords: input.keywords, team_id: null,
  });
  if (error) throw error;
}

export async function updateApp(id: string, input: { name: string; prefix: string }): Promise<void> {
  const { error } = await supabase.from('app_routing').update({ app_name: input.name, app_prefix: input.prefix }).eq('id', id);
  if (error) throw error;
}

export async function deleteApp(id: string): Promise<void> {
  const { error } = await supabase.from('app_routing').delete().eq('id', id);
  if (error) throw error;
}

export async function setAppPic(id: string, picId: string | null): Promise<void> {
  const { error } = await supabase.from('app_routing').update({ primary_pic_id: picId }).eq('id', id);
  if (error) throw error;
}

// ─── SLA RULES CRUD ──────────────────────────────────────────────────────────

export async function updateSlaRule(id: string, input: { targetHours?: number; warningPercent?: number }): Promise<void> {
  const payload: Record<string, number> = {};
  if (input.targetHours !== undefined) payload.target_hours = input.targetHours;
  if (input.warningPercent !== undefined) payload.warning_percent = input.warningPercent;
  const { error } = await supabase.from('sla_rules').update(payload).eq('id', id);
  if (error) throw error;
}

// ─── KNOWLEDGE BASE CRUD ─────────────────────────────────────────────────────

export async function createKbArticle(input: { title: string; category: string; body: string; isPublished: boolean }): Promise<void> {
  const { error } = await supabase.from('kb_articles').insert({
    title: input.title, category: input.category, body: input.body, is_published: input.isPublished,
  });
  if (error) throw error;
}

export async function updateKbArticle(id: string, input: { title?: string; category?: string; body?: string; isPublished?: boolean }): Promise<void> {
  const payload: Record<string, unknown> = {};
  if (input.title !== undefined) payload.title = input.title;
  if (input.category !== undefined) payload.category = input.category;
  if (input.body !== undefined) payload.body = input.body;
  if (input.isPublished !== undefined) payload.is_published = input.isPublished;
  const { error } = await supabase.from('kb_articles').update(payload).eq('id', id);
  if (error) throw error;
}

export async function deleteKbArticle(id: string): Promise<void> {
  const { error } = await supabase.from('kb_articles').delete().eq('id', id);
  if (error) throw error;
}
