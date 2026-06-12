-- IT Helpdesk — Supabase PostgreSQL Schema v4
-- Post-Stakeholder Review (2026-05-31)
-- Run this in the Supabase SQL editor to initialize the database.

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
  created_at  timestamptz default now()
);

-- ============================================================
-- PICs (Team Members)
-- ============================================================
create table if not exists pics (
  id          text primary key,  -- e.g., "p-ivan"
  name        text not null,
  email       text,
  team_id     text references teams(id),
  is_active   boolean default true,
  created_at  timestamptz default now()
);

-- ============================================================
-- PROFILES — User accounts (mirrors auth.users)
-- ============================================================
create table if not exists profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text unique not null,
  name        text not null,
  initials    text,
  role        text not null check (role in ('admin', 'pic', 'user')),
  dept        text,
  team_id     text references teams(id),
  pic_id      text references pics(id),
  is_head     boolean default false,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- ============================================================
-- APPLICATION ROUTING RULES
-- Maps application → team → PIC(s)
-- ============================================================
create table if not exists app_routing (
  id              uuid primary key default gen_random_uuid(),
  app_name        text not null,
  app_prefix      text,
  app_keywords    text[],          -- for auto-detection
  team_id         text references teams(id),
  primary_pic_id  text references pics(id),
  is_active       boolean default true,
  created_by      uuid references profiles(id),
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- ============================================================
-- MULTI-PIC MAPPING (pivot table)
-- Allows multiple PICs per application
-- ============================================================
create table if not exists app_routing_pics (
  id              uuid primary key default gen_random_uuid(),
  app_routing_id  uuid references app_routing(id) on delete cascade,
  pic_id          text references pics(id),
  created_at      timestamptz default now(),
  unique(app_routing_id, pic_id)
);

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
create table if not exists tickets (
  id                  text primary key,
  subject             text not null,
  body                text,
  from_email          text not null,
  from_name           text,
  dept                text,
  category            text check (category in ('Hardware', 'Software', 'Network', 'Access', 'Other')),
  app                 text,
  priority            text not null default 'Medium' check (priority in ('Low', 'Medium', 'High', 'Critical')),

  -- Routing fields (auto-filled by system based on app_routing)
  assignee_team_id    text references teams(id),
  assigned_pics      text[],                       -- Array of pic_ids, e.g. ["p-ivan", "p-apri"]
  assigned_to_id      text,                         -- Owner (null if queued/multi-PIC)

  -- Internal fields (user cannot see/edit directly)
  specific_task       text,                        -- Internal only, user tidak lihat

  -- Status & SLA
  status              text not null default 'Open' check (status in ('Open', 'Queued', 'In Progress', 'Done', 'Closed')),
  sla_deadline        timestamptz,
  sla_warning_at      timestamptz,
  resolved_at         timestamptz,
  closed_at           timestamptz,

  -- Rating & Meta
  csat                integer check (csat >= 1 and csat <= 5),
  created_by          uuid references profiles(id),
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

-- ============================================================
-- COMMENTS
-- ============================================================
create table if not exists comments (
  id              uuid primary key default gen_random_uuid(),
  ticket_id       text not null references tickets(id) on delete cascade,
  author_id       uuid references profiles(id),
  author_name     text,
  author_initials text,
  body            text not null,
  is_internal     boolean default false,            -- Internal notes (user tidak lihat)
  attachment_url  text,
  created_at      timestamptz default now()
);

-- ============================================================
-- TICKET TIMELINE (activity log)
-- ============================================================
create table if not exists ticket_timeline (
  id          uuid primary key default gen_random_uuid(),
  ticket_id   text not null references tickets(id) on delete cascade,
  event_type  text not null,                       -- created, assigned, claimed, in_progress, commented, resolved, closed, reassigned
  actor_id    uuid references profiles(id),
  actor_name  text,
  actor_role  text,
  description  text,
  metadata    jsonb,
  created_at  timestamptz default now()
);

-- ============================================================
-- NOTIFICATIONS
-- ============================================================
create table if not exists notifications (
  id          uuid primary key default gen_random_uuid(),
  ticket_id   text references tickets(id) on delete cascade,
  team_id     text,
  pic_id      text,
  user_id     uuid references profiles(id),
  type        text,                                -- new_ticket, mentioned, assigned, claimed, commented, sla_warning, sla_breach
  title       text,
  message     text,
  is_read     boolean default false,
  created_at  timestamptz default now()
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
  created_by  uuid references profiles(id),
  views       integer default 0,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- ============================================================
-- IMPORTED USERS (staging table for CSV import)
-- ============================================================
create table if not exists import_queue (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  name        text,
  role        text,
  team_id     text,
  pic_id      text,
  status      text default 'pending' check (status in ('pending', 'processing', 'completed', 'failed')),
  error_msg   text,
  created_by  uuid references profiles(id),
  created_at  timestamptz default now()
);

-- ============================================================
-- AUDIT LOG
-- ============================================================
create table if not exists audit_log (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references profiles(id),
  actor_name  text,
  action      text not null,                       -- login, logout, create_ticket, update_status, reassign, import_users, etc.
  entity_type text,                               -- tickets, profiles, app_routing, sla_rules, etc.
  entity_id   text,
  payload     jsonb,
  ip_address  text,
  user_agent  text,
  created_at  timestamptz default now()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

-- Teams: readable by all authenticated users, admin only can modify
alter table teams enable row level security;
create policy "teams_read" on teams for select using (auth.role() = 'authenticated');
create policy "teams_write" on teams for all using (
  exists (select 1 from profiles where id = auth.uid() and role = 'admin')
);

-- Pics: readable by all, admin only can modify
alter table pics enable row level security;
create policy "pics_read" on pics for select using (auth.role() = 'authenticated');
create policy "pics_write" on pics for all using (
  exists (select 1 from profiles where id = auth.uid() and role = 'admin')
);

-- Profiles: users can read all, update only own row
alter table profiles enable row level security;
create policy "profiles_read" on profiles for select using (auth.role() = 'authenticated');
create policy "profiles_update_own" on profiles for update using (auth.uid() = id);
create policy "profiles_insert" on profiles for insert with check (auth.role() in ('admin'));

-- App Routing: readable by authenticated, writable by admin
alter table app_routing enable row level security;
create policy "app_routing_read" on app_routing for select using (auth.role() = 'authenticated');
create policy "app_routing_write" on app_routing for all using (
  exists (select 1 from profiles where id = auth.uid() and role = 'admin')
);

-- App Routing Pics: same as app_routing
alter table app_routing_pics enable row level security;
create policy "app_routing_pics_read" on app_routing_pics for select using (auth.role() = 'authenticated');
create policy "app_routing_pics_write" on app_routing_pics for all using (
  exists (select 1 from profiles where id = auth.uid() and role = 'admin')
);

-- SLA Rules: readable by all, writable by admin
alter table sla_rules enable row level security;
create policy "sla_rules_read" on sla_rules for select using (auth.role() = 'authenticated');
create policy "sla_rules_write" on sla_rules for all using (
  exists (select 1 from profiles where id = auth.uid() and role = 'admin')
);

-- Tickets: User sees own, PIC sees team tickets, Admin sees all
alter table tickets enable row level security;
create policy "tickets_read_own" on tickets for select using (
  exists (
    select 1 from profiles
    where id = auth.uid() and role = 'user' and created_by = auth.uid()
  )
  or
  exists (
    select 1 from profiles p
    where p.id = auth.uid() and p.role in ('pic', 'admin') and (
      p.team_id = assignee_team_id
      or auth.uid() = created_by
    )
  )
  or
  exists (
    select 1 from profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
);
create policy "tickets_insert" on tickets for insert with check (auth.role() = 'authenticated');
create policy "tickets_update_team" on tickets for update using (
  exists (
    select 1 from profiles p
    where p.id = auth.uid() and p.role = 'pic' and p.team_id = assignee_team_id
  )
  or
  exists (
    select 1 from profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
);

-- Comments: User sees public comments on own tickets, PIC sees all on team tickets
alter table comments enable row level security;
create policy "comments_read_user" on comments for select using (
  not is_internal and exists (
    select 1 from tickets t
    join profiles p on p.id = auth.uid()
    where t.id = ticket_id and (t.created_by = auth.uid() or p.team_id = t.assignee_team_id)
    and p.role = 'user'
  )
  or
  exists (
    select 1 from profiles p
    where p.id = auth.uid() and p.role in ('pic', 'admin')
    and exists (
      select 1 from tickets tt
      where tt.id = ticket_id and (p.team_id = tt.assignee_team_id or true)
    )
  )
);
create policy "comments_insert" on comments for insert with check (auth.role() = 'authenticated');

-- Timeline: same as tickets (user sees own, team sees team, admin sees all)
alter table ticket_timeline enable row level security;
create policy "timeline_read" on ticket_timeline for select using (
  exists (
    select 1 from profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
  or
  exists (
    select 1 from tickets t
    join profiles p on p.id = auth.uid()
    where t.id = ticket_id and (
      (p.role = 'user' and t.created_by = auth.uid())
      or (p.role in ('pic', 'admin') and p.team_id = t.assignee_team_id)
    )
  )
);
create policy "timeline_insert" on ticket_timeline for insert with check (auth.role() = 'authenticated');

-- Notifications: each user/PIC sees only their own
alter table notifications enable row level security;
create policy "notifications_read_own" on notifications for select using (
  user_id = auth.uid()
  or
  exists (
    select 1 from profiles p
    where p.id = auth.uid() and p.pic_id = notifications.pic_id
  )
  or
  exists (
    select 1 from profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
);
create policy "notifications_update_own" on notifications for update using (
  user_id = auth.uid()
  or exists (
    select 1 from profiles p
    where p.id = auth.uid() and p.pic_id = notifications.pic_id
  )
  or exists (
    select 1 from profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
);

-- KB Articles: published articles readable by all, writable by admin/pic
alter table kb_articles enable row level security;
create policy "kb_read_published" on kb_articles for select using (
  is_published = true
  or
  exists (
    select 1 from profiles p
    where p.id = auth.uid() and p.role in ('admin', 'pic')
  )
);
create policy "kb_write" on kb_articles for all using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin', 'pic'))
);

-- Audit Log: admin only
alter table audit_log enable row level security;
create policy "audit_read" on audit_log for select using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
);
create policy "audit_insert" on audit_log for insert with check (auth.role() = 'authenticated');

-- Import Queue: admin only
alter table import_queue enable row level security;
create policy "import_queue_read" on import_queue for select using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
);
create policy "import_queue_write" on import_queue for all using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
);

-- ============================================================
-- INDEXES
-- ============================================================
create index if not exists idx_teams_id on teams(id);
create index if not exists idx_pics_team on pics(team_id);
create index if not exists idx_pics_active on pics(is_active) where is_active = true;
create index if not exists idx_profiles_team on profiles(team_id);
create index if not exists idx_profiles_pic on profiles(pic_id);
create index if not exists idx_app_routing_team on app_routing(team_id);
create index if not exists idx_app_routing_app_name on app_routing(app_name);
create index if not exists idx_app_routing_pics_app on app_routing_pics(app_routing_id);
create index if not exists idx_sla_priority on sla_rules(priority);

create index if not exists idx_tickets_status on tickets(status);
create index if not exists idx_tickets_team on tickets(assignee_team_id);
create index if not exists idx_tickets_assigned_pics on tickets using gin(assigned_pics);
create index if not exists idx_tickets_owner on tickets(assigned_to_id) where assigned_to_id is not null;
create index if not exists idx_tickets_created_by on tickets(created_by);
create index if not exists idx_tickets_created_at on tickets(created_at desc);
create index if not exists idx_tickets_sla_warning on tickets(sla_warning_at) where status not in ('Done', 'Closed');
create index if not exists idx_tickets_sla_deadline on tickets(sla_deadline) where status not in ('Done', 'Closed');

create index if not exists idx_comments_ticket on comments(ticket_id);
create index if not exists idx_comments_internal on comments(is_internal) where is_internal = false;

create index if not exists idx_timeline_ticket on ticket_timeline(ticket_id, created_at);

create index if not exists idx_notifications_user on notifications(user_id, is_read);
create index if not exists idx_notifications_pic on notifications(pic_id, is_read);
create index if not exists idx_notifications_team on notifications(team_id, is_read);
create index if not exists idx_notifications_unread on notifications(is_read) where is_read = false;

create index if not exists idx_kb_published on kb_articles(is_published) where is_published = true;
create index if not exists idx_kb_category on kb_articles(category);

create index if not exists idx_audit_actor on audit_log(actor_id);
create index if not exists idx_audit_entity on audit_log(entity_type, entity_id);
create index if not exists idx_audit_created on audit_log(created_at desc);

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

create trigger tr_profiles_updated_at
  before update on profiles
  for each row execute function update_updated_at();

create trigger tr_tickets_updated_at
  before update on tickets
  for each row execute function update_updated_at();

create trigger tr_kb_updated_at
  before update on kb_articles
  for each row execute function update_updated_at();

-- Generate ticket ID (HD-00001 format)
create sequence if not exists ticket_id_seq;

create or replace function generate_ticket_id()
returns text as $$
declare
  new_id text;
  seq_val integer;
begin
  select nextval('ticket_id_seq') into seq_val;
  new_id := 'HD-' || lpad(seq_val::text, 5, '0');
  return new_id;
end;
$$ language plpgsql;

-- ============================================================
-- SEED DATA (Initial Teams & PICs)
-- ============================================================

-- Teams
insert into teams (id, name, head_pic_id, head_name, head_email) values
  ('team-ivan', 'Team Ivan', 'p-ivan', 'Ivan', 'ivan@lippoland.id'),
  ('team-nicholas', 'Team Nicholas', 'p-leo', 'Leo', 'leo@lippoland.id'),
  ('team-joshua', 'Team Joshua', 'p-joshua', 'Joshua', 'joshua@lippoland.id')
on conflict (id) do nothing;

-- PICs (Team Ivan)
insert into pics (id, name, email, team_id) values
  ('p-ivan', 'Ivan', 'ivan@lippoland.id', 'team-ivan'),
  ('p-apri', 'Apri', 'apri@lippoland.id', 'team-ivan'),
  ('p-kevin', 'Kevin', 'kevin@lippoland.id', 'team-ivan'),
  ('p-lukas', 'Lukas', 'lukas@lippoland.id', 'team-ivan')
on conflict (id) do nothing;

-- PICs (Team Nicholas)
insert into pics (id, name, email, team_id) values
  ('p-leo', 'Leo', 'leo@lippoland.id', 'team-nicholas'),
  ('p-nicholas', 'Nicholas', 'nicholas@lippoland.id', 'team-nicholas')
on conflict (id) do nothing;

-- PICs (Team Joshua)
insert into pics (id, name, email, team_id) values
  ('p-joshua', 'Joshua', 'joshua@lippoland.id', 'team-joshua'),
  ('p-christian', 'Cristian', 'cristian@lippoland.id', 'team-joshua')
on conflict (id) do nothing;

-- SLA Rules
insert into sla_rules (priority, target_hours, warning_percent) values
  ('Critical', 2, 75),
  ('High', 8, 75),
  ('Medium', 24, 75),
  ('Low', 72, 75)
on conflict (priority) do nothing;

-- Default App Routing (single PIC per app for simplicity)
insert into app_routing (app_name, app_prefix, team_id, primary_pic_id) values
  -- Team Ivan
  ('[PRJ] - Project System', 'PRJ', 'team-ivan', 'p-ivan'),
  ('[PRJ] - Cash Advance', 'PRJ', 'team-ivan', 'p-apri'),
  ('[PRJ] - Cashflow', 'PRJ', 'team-ivan', 'p-apri'),
  ('[PRJ] - AP Management', 'PRJ', 'team-ivan', 'p-apri'),
  ('[PRJ] - Legal Management System', 'PRJ', 'team-ivan', 'p-ivan'),
  ('[SLS] - Sales Portal', 'SLS', 'team-ivan', 'p-kevin'),
  ('[SLS] - Siteplan Report', 'SLS', 'team-ivan', 'p-kevin'),
  ('[SLS] - Commission System', 'SLS', 'team-ivan', 'p-kevin'),
  ('[CMN] - Tax System', 'CMN', 'team-ivan', 'p-kevin'),
  ('[SLS] - Property System', 'SLS', 'team-ivan', 'p-ivan'),
  -- Team Nicholas
  ('[PRJ] - Cost Contract', 'PRJ', 'team-nicholas', 'p-leo'),
  ('[PRJ] - Vendor Portal', 'PRJ', 'team-nicholas', 'p-leo'),
  ('[PRJ] - Construction Activity', 'PRJ', 'team-nicholas', 'p-leo'),
  ('[SLS] - Cynergy', 'SLS', 'team-nicholas', 'p-leo'),
  ('[CMN] - Cynergi', 'CMN', 'team-nicholas', 'p-leo'),
  -- Team Joshua
  ('[SLS] - Budget Marketing', 'SLS', 'team-joshua', 'p-joshua'),
  ('[TMD] - Billing System', 'TMD', 'team-joshua', 'p-joshua'),
  ('[TMD] - Residential Services', 'TMD', 'team-joshua', 'p-joshua'),
  ('[TMD] - BCD System', 'TMD', 'team-joshua', 'p-joshua'),
  ('[TMD] - Hand Over', 'TMD', 'team-joshua', 'p-joshua'),
  ('[CMN] - Email Blast System', 'CMN', 'team-joshua', 'p-christian'),
  ('[SLS] - PR Portal', 'SLS', 'team-joshua', 'p-christian'),
  ('[TMD] - eTMD', 'TMD', 'team-joshua', 'p-christian'),
  ('[TMD] - Online Payment', 'TMD', 'team-joshua', 'p-christian'),
  ('[TMD] - Cashier System', 'TMD', 'team-joshua', 'p-christian'),
  ('[TMD] - LEAP', 'TMD', 'team-joshua', 'p-christian')
on conflict do nothing;

-- ============================================================
-- DONE
-- ============================================================