-- IT Helpdesk — Supabase PostgreSQL Schema v6
-- Supabase Auth adopted (2026-06-13). Supersedes v5 "Simplified prototype",
-- which left every table open to the anon role. v6 introduces a `profiles`
-- table (app identity keyed by auth.users.id), role-aware RLS, and removes all
-- anon access. After running this file:
--   1. set SUPABASE_SERVICE_ROLE_KEY in your environment
--   2. run `node scripts/provision-auth.mjs` to create auth.users + profiles
--      for the 14 seed accounts and any existing app_users rows.
-- Run this in the Supabase SQL editor to initialize/update the database.

-- Enable UUID extension
create extension if not exists "pgcrypto";

-- ============================================================
-- TEAMS
-- ============================================================
create table if not exists teams (
  id          text primary key,
  name        text not null,
  head_pic_id text,        -- pic_id who is head
  head_name   text,
  head_email  text,
  role        text,        -- team category label, e.g. 'owner', 'tech', 'admin'
  created_at  timestamptz default now()
);

-- ============================================================
-- PICs (Team Members)
-- ============================================================
create table if not exists pics (
  id          text primary key,  -- e.g., "p-ivan"
  name        text not null,
  email       text,
  initials    text,
  team_id     text references teams(id),
  is_head     boolean default false,
  sub_team    text,
  is_active   boolean default true,
  created_at  timestamptz default now()
);

-- For installs that already had teams/pics from an earlier schema version,
-- backfill the new columns (no-op on fresh installs — already in CREATE TABLE above)
alter table teams add column if not exists role text;
alter table pics add column if not exists initials text;
alter table pics add column if not exists is_head boolean default false;
alter table pics add column if not exists sub_team text;

-- ============================================================
-- CATEGORIES (Ticket category labels)
-- ============================================================
create table if not exists categories (
  id          text primary key,  -- e.g., "PRJ"
  name        text not null,
  color       text,
  created_at  timestamptz default now()
);

-- ============================================================
-- APPLICATION ROUTING RULES
-- Maps application → team → PIC
-- ============================================================
create table if not exists app_routing (
  id              uuid primary key default gen_random_uuid(),
  app_name        text not null,
  app_prefix      text,
  app_keywords    text[],          -- for auto-detection
  team_id         text references teams(id),
  primary_pic_id  text references pics(id),
  is_active       boolean default true,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- Older installs may have a created_by column referencing the now-removed
-- profiles table — drop it (the app never set this field).
alter table app_routing drop column if exists created_by;

-- ============================================================
-- SLA RULES (Admin configurable)
-- ============================================================
create table if not exists sla_rules (
  id              uuid primary key default gen_random_uuid(),
  priority        text unique not null,
  target_hours    integer not null,
  warning_percent integer default 75,
  created_at      timestamptz default now()
);

-- ============================================================
-- TICKETS
-- ============================================================
-- v5: simplified single-table design. comments/activity/attachments are
-- stored as jsonb, matching src/types/index.ts (Comment, ActivityItem,
-- Attachment) 1:1 — no separate comments/ticket_timeline tables and no
-- dependency on Supabase Auth (auth.uid()/auth.users).
--
-- The previous v4 "tickets" table (uuid FKs to profiles, status/category
-- check constraints that didn't match the app, assigned_pics[] for a
-- multi-PIC queue that was never implemented) is dropped and recreated —
-- it held no real data, since the app has only ever written tickets to
-- localStorage.
drop table if exists tickets cascade;

create table tickets (
  id                    text primary key,
  subject               text not null,
  body                  text,
  from_email            text not null,
  from_name             text,
  dept                  text,
  cc                    text[],
  category              text,
  app                   text,
  specific_task         text,
  priority              text not null default 'Medium' check (priority in ('Low', 'Medium', 'High', 'Critical')),
  assignee_team_id      text,
  assigned_to_id        text,
  assigned_name         text,
  status                text not null default 'Open' check (status in ('Open', 'In Progress', 'Pending', 'Revisi', 'Done', 'Closed')),
  auto_routed           boolean default false,
  auto_route_confidence jsonb,
  sla_deadline          timestamptz,
  resolved_at           timestamptz,
  attachments           jsonb not null default '[]'::jsonb,
  comments              jsonb not null default '[]'::jsonb,
  activity              jsonb not null default '[]'::jsonb,
  csat                  integer check (csat >= 1 and csat <= 5),
  created_at            timestamptz default now(),
  updated_at            timestamptz default now()
);

-- ============================================================
-- APP USERS (registered via Admin > Import User CSV)
-- ============================================================
-- Mirrors RegisteredUser from src/lib/user-store.ts. SEED_ACCOUNTS (the 14
-- built-in accounts) stay hardcoded in src/lib/account-store.ts — they're
-- identical on every device already and don't need a table.
create table if not exists app_users (
  id                text primary key,
  email             text unique not null,
  name              text not null,
  dept              text,
  role              text not null check (role in ('user', 'pic')),
  team_id           text,
  default_password  text not null,
  registered_at     timestamptz default now(),
  email_sent        boolean default false
);

-- ============================================================
-- KB ARTICLES (Knowledge Base)
-- ============================================================
create table if not exists kb_articles (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  body        text,
  category    text,
  is_published boolean default false,
  views       integer default 0,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- Older installs may have a created_by column referencing the now-removed
-- profiles table — drop it (the app never set this field).
alter table kb_articles drop column if exists created_by;

-- ============================================================
-- Drop unused v4 tables — depended on Supabase Auth / auth.users, never
-- adopted. The multi-PIC queue, ticket_timeline, notifications, audit log
-- and CSV import staging were all simplified away in the actual app.
-- ============================================================
drop table if exists comments cascade;
drop table if exists ticket_timeline cascade;
drop table if exists notifications cascade;
drop table if exists audit_log cascade;
drop table if exists import_queue cascade;
drop table if exists app_routing_pics cascade;

-- ============================================================
-- PROFILES (app identity for Supabase Auth users)
-- ============================================================
-- v6: the app now authenticates via Supabase Auth. auth.users holds the
-- credential; this table holds the app-specific identity (role, pic linkage,
-- dept/team) keyed by auth.users.id. Populated by scripts/provision-auth.mjs
-- (seed accounts + existing app_users) and by the admin create-user API route.
create table if not exists profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text unique not null,
  name        text not null,
  role        text not null default 'user' check (role in ('user', 'pic', 'admin')),
  pic_id      text,
  dept        text,
  team_id     text,
  created_at  timestamptz default now()
);
create index if not exists idx_profiles_role on profiles(role);

-- ============================================================
-- ROLE HELPERS (for RLS — Supabase Auth)
-- ============================================================
-- SECURITY DEFINER so reading the caller's profile inside a policy does NOT
-- re-trigger profiles' own RLS (which would recurse). Must be created before
-- the policies that reference them.
create or replace function auth_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function auth_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select role from public.profiles where id = auth.uid()) = 'admin', false);
$$;

-- The caller's email (from their profile), used for per-row ticket ownership.
create or replace function auth_email()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select email from public.profiles where id = auth.uid();
$$;

-- ============================================================
-- ROW LEVEL SECURITY (Supabase Auth — v6)
-- ============================================================
-- The frontend now authenticates via Supabase Auth: every data request carries
-- the user's JWT, and the anon role is no longer trusted with any table.
--   * Master data + KB: readable by any authenticated user; writable by admins.
--   * Tickets: per-row — a user sees/edits only their own; PIC/admin see all.
--     Insert open to authenticated; delete restricted to PIC/admin.
--   * app_users + profiles: only the owner and admins can read; only admins
--     (and the service role, which bypasses RLS) can write.
-- Every policy is preceded by `drop policy if exists` so this file stays
-- re-runnable (CREATE POLICY has no IF NOT EXISTS).

-- helper expressions used below:
--   auth.uid() is not null   → request is authenticated
--   auth_is_admin()          → caller's profile.role = 'admin'

-- Teams: authenticated read, admin write
alter table teams enable row level security;
drop policy if exists "teams_read" on teams;
create policy "teams_read" on teams for select using (auth.uid() is not null);
drop policy if exists "teams_write" on teams;
create policy "teams_write" on teams for all using (auth_is_admin()) with check (auth_is_admin());

-- Pics: authenticated read, admin write
alter table pics enable row level security;
drop policy if exists "pics_read" on pics;
create policy "pics_read" on pics for select using (auth.uid() is not null);
drop policy if exists "pics_write" on pics;
create policy "pics_write" on pics for all using (auth_is_admin()) with check (auth_is_admin());

-- Categories: authenticated read, admin write
alter table categories enable row level security;
drop policy if exists "categories_read" on categories;
create policy "categories_read" on categories for select using (auth.uid() is not null);
drop policy if exists "categories_write" on categories;
create policy "categories_write" on categories for all using (auth_is_admin()) with check (auth_is_admin());

-- App Routing: authenticated read, admin write
alter table app_routing enable row level security;
drop policy if exists "app_routing_read" on app_routing;
create policy "app_routing_read" on app_routing for select using (auth.uid() is not null);
drop policy if exists "app_routing_write" on app_routing;
create policy "app_routing_write" on app_routing for all using (auth_is_admin()) with check (auth_is_admin());

-- SLA Rules: authenticated read, admin write
alter table sla_rules enable row level security;
drop policy if exists "sla_rules_read" on sla_rules;
create policy "sla_rules_read" on sla_rules for select using (auth.uid() is not null);
drop policy if exists "sla_rules_write" on sla_rules;
create policy "sla_rules_write" on sla_rules for all using (auth_is_admin()) with check (auth_is_admin());

-- Tickets: per-row ownership.
--   read   → a user sees only their own tickets; PIC/admin see all.
--   insert → any authenticated user (users file their own; first-load seeding).
--   update → owner (e.g. replying to own ticket) or PIC/admin.
--   delete → PIC/admin only.
alter table tickets enable row level security;
drop policy if exists "tickets_read" on tickets;
-- auth_role()/auth_email() are wrapped in scalar subqueries so Postgres
-- evaluates them ONCE per statement (init-plan) instead of re-running the
-- profiles lookup for every row — without this, a large tickets table makes
-- SELECT * blow past statement_timeout. See Supabase RLS performance guide.
create policy "tickets_read" on tickets for select
  using (
    (select auth_role()) in ('pic', 'admin')
    or lower(from_email) = lower(coalesce((select auth_email()), ''))
  );
-- Drop the old combined write policy from earlier v6 revisions, then split.
drop policy if exists "tickets_write" on tickets;
drop policy if exists "tickets_insert" on tickets;
create policy "tickets_insert" on tickets for insert
  with check (auth.uid() is not null);
drop policy if exists "tickets_update" on tickets;
create policy "tickets_update" on tickets for update
  using (
    (select auth_role()) in ('pic', 'admin')
    or lower(from_email) = lower(coalesce((select auth_email()), ''))
  )
  with check (
    (select auth_role()) in ('pic', 'admin')
    or lower(from_email) = lower(coalesce((select auth_email()), ''))
  );
drop policy if exists "tickets_delete" on tickets;
create policy "tickets_delete" on tickets for delete
  using ((select auth_role()) in ('pic', 'admin'));

-- App Users: only admins can see/manage the registered-account list. Creation
-- happens via the service role (admin create-user API route), which bypasses RLS.
alter table app_users enable row level security;
drop policy if exists "app_users_read" on app_users;
create policy "app_users_read" on app_users for select using (auth_is_admin());
drop policy if exists "app_users_write" on app_users;
create policy "app_users_write" on app_users for all using (auth_is_admin()) with check (auth_is_admin());

-- Profiles: a user may read their own profile; admins may read all. Writes are
-- admin-only via the app; provisioning/creation uses the service role.
alter table profiles enable row level security;
drop policy if exists "profiles_read" on profiles;
create policy "profiles_read" on profiles for select using (id = auth.uid() or auth_is_admin());
drop policy if exists "profiles_write" on profiles;
create policy "profiles_write" on profiles for all using (auth_is_admin()) with check (auth_is_admin());

-- KB Articles: authenticated read, admin write
alter table kb_articles enable row level security;
drop policy if exists "kb_read" on kb_articles;
create policy "kb_read" on kb_articles for select using (auth.uid() is not null);
drop policy if exists "kb_write" on kb_articles;
create policy "kb_write" on kb_articles for all using (auth_is_admin()) with check (auth_is_admin());

-- ============================================================
-- INDEXES
-- ============================================================
create index if not exists idx_teams_id on teams(id);
create index if not exists idx_pics_team on pics(team_id);
create index if not exists idx_pics_active on pics(is_active) where is_active = true;
create index if not exists idx_app_routing_team on app_routing(team_id);
create index if not exists idx_app_routing_app_name on app_routing(app_name);
create index if not exists idx_sla_priority on sla_rules(priority);

create index if not exists idx_tickets_status on tickets(status);
create index if not exists idx_tickets_team on tickets(assignee_team_id);
create index if not exists idx_tickets_assigned_to on tickets(assigned_to_id) where assigned_to_id is not null;
create index if not exists idx_tickets_from_email on tickets(from_email);
-- Matches the RLS ownership predicate `lower(from_email) = lower(auth_email())`
-- so a regular user's ticket read is an index lookup, not a full scan.
create index if not exists idx_tickets_from_email_lower on tickets(lower(from_email));
create index if not exists idx_tickets_created_at on tickets(created_at desc);

create index if not exists idx_app_users_email on app_users(email);

create index if not exists idx_kb_published on kb_articles(is_published) where is_published = true;
create index if not exists idx_kb_category on kb_articles(category);

-- ============================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================

-- Auto-update updated_at timestamp
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists tr_tickets_updated_at on tickets;
create trigger tr_tickets_updated_at
  before update on tickets
  for each row execute function update_updated_at();

drop trigger if exists tr_kb_updated_at on kb_articles;
create trigger tr_kb_updated_at
  before update on kb_articles
  for each row execute function update_updated_at();

-- Atomic append for ticket comments/activity (avoids the lost-update race from
-- client-side read-modify-write of the jsonb arrays). p_comments and p_activity
-- are jsonb ARRAYS that get concatenated onto the existing arrays in a single
-- row-locked UPDATE. p_status / p_resolved_at are optional scalar overrides.
-- Called from src/lib/ticket-store.ts appendTicketEvent() via supabase.rpc().
-- Safe to run on an existing database — it does not touch table data.
create or replace function append_ticket_event(
  p_id          text,
  p_comments    jsonb       default '[]'::jsonb,
  p_activity    jsonb       default '[]'::jsonb,
  p_status      text        default null,
  p_resolved_at timestamptz default null
)
returns void
language sql
as $$
  update tickets set
    comments    = coalesce(comments, '[]'::jsonb) || coalesce(p_comments, '[]'::jsonb),
    activity    = coalesce(activity, '[]'::jsonb) || coalesce(p_activity, '[]'::jsonb),
    status      = coalesce(p_status, status),
    resolved_at = coalesce(p_resolved_at, resolved_at),
    updated_at  = now()
  where id = p_id;
$$;

-- ============================================================
-- SEED DATA
-- ============================================================
-- Master data (teams, pics, categories, app_routing, sla_rules,
-- kb_articles) is NOT seeded here. Run supabase/seed.sql after this
-- file — it contains the full, idempotent dataset matching src/lib/data.ts.
--
-- Tickets are seeded automatically on first load by
-- src/lib/ticket-store.ts (fetchTickets) from src/lib/data.ts seedTickets,
-- if the tickets table is empty.

-- ============================================================
-- DONE
-- ============================================================
