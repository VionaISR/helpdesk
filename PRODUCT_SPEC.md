# IT Helpdesk — Product Specification

> **Status:** v4 — Post-Stakeholder Review Revision  
> **Stack:** Next.js 15 · TypeScript · Supabase (Auth + DB + Realtime) · Resend  
> **Terakhir diperbarui:** 2026-05-31

---

## Cara Membaca Dokumen Ini

| Penanda | Arti |
|---------|------|
| `[IMPL]` | Perlu implementasi — sudah jelas dan siap digarap |
| `[DISKUSI]` | **Belum bisa dikerjakan** — perlu diskusi lanjutan |
| `[OOS]` | Out of scope, tidak akan dibangun |
| `🔴 BARU` | Fitur/konsep baru dari stakeholder review |

---

## 1. Ringkasan Produk

Sistem ticketing internal untuk tim IT perusahaan Lippo. Karyawan submit tiket via portal, sistem auto-route ke tim/PIC yang tepat, PIC menangani via dashboard, admin mengelola konfigurasi dan laporan.

**Prinsip utama (dari stakeholder review):**
1. **User experience sederhana** — user hanya isi Subject, Application, Category, Description, Attachment
2. **Auto-routing otomatis** — sistem tentukan Team dan PIC berdasarkan Application Mapping
3. **Transparan** — user bisa lihat Assigned Team, Assigned PIC, Ticket Timeline, SLA Status

---

## 2. Roles & Permission

| Role | Deskripsi | Akses |
|------|-----------|-------|
| **User** | Karyawan yang submit tiket | Submit tiket, lihat tiket sendiri, beri rating, lihat timeline & PIC |
| **PIC** | Tim support teknis | Inbox (queue), claim tiket, update status, komentar, internal notes |
| **Head** | Kepala tim PIC | Semua akses PIC + bisa re-assign within team |
| **Admin** | Administrator sistem | Full access — config, laporan, import, cutoff |

**Aturan isolasi data:**
- User hanya melihat tiket yang dia buat sendiri
- PIC hanya melihat tiket di queue timnya + tiket yang dia claim
- Admin melihat semua tiket tanpa batasan

---

## 3. 🔴 BARU — Konsep Team, Assigned Team, Assigned PIC

### 3.1 Team Structure

Setiap aplikasi di-mapping ke satu **Team**. Setiap Team punya satu atau lebih **PIC**.

```
Application Mapping → Team Assignment → PIC Assignment
     [PRJ] Project System    →  Team Ivan  →  Ivan (Head)
                                    →  Apri (PIC)
                                    →  Kevin (PIC)
                                    →  Lukas (PIC)
```

### 3.2 Single PIC Assignment

Aplikasi yang di-mapping ke **satu PIC spesifik** (misal: hanya Ivan yang handle Project System):

```
Tiket masuk → Assigned Team: Team Ivan
           → Assigned PIC: Ivan
           → Status: Auto-assigned, belum di-claim
```

### 3.3 🔴 BARU — Multiple PIC Assignment (Queue System)

Aplikasi yang di-mapping ke **banyak PIC** (misal: Team Joshua punya Joshua + Cristian):

```
Tiket masuk → Assigned Team: Team Joshua
           → Assigned PIC: [Joshua, Cristian] (array)
           → Status: QUEUED
           → Semua PIC di tim menerima notifikasi
           → PIC pertama yang claim → menjadi Owner (assigned_to_id)
           → PIC lain yang tidak claim → tetap di queue, tidak handle
```

### 3.4 🔴 BARU — Claim Logic

```
QUEUE STATE:
  assigned_pics = ["joshua", "cristian"]
  assigned_to_id = null  ← belum ada owner
  owner = null

PIC JOSHUA CLAIMS:
  assigned_to_id = "joshua"
  owner = joshua
  → Tiket keluar dari queue, joshua jadi owner

TIDAKADA YANG CLAIM (24 jam):
  → Admin notified
  → Admin bisa assign manual atau escalate
```

---

## 4. 🔴 BARU — User Submit Flow (Simplified)

### 4.1 User Portal — Form Fields

**User hanya mengisi (6 fields):**

| Field | Tipe | Keterangan |
|-------|------|-------------|
| Subject | Text | Required, max 200 chars |
| Application | Dropdown | Required, dari app list → auto-determine Team & PIC |
| Category | Dropdown | Hardware, Software, Network, Access |
| Description | Textarea | Required, max 5000 chars |
| Attachment | File | Optional, max 5 files, 10MB each |
| Priority | Dropdown | Auto: Medium, bisa override user |

### 4.2 🔴 BARU — Auto-Routing Logic

```
User pilih Application
  ↓
System lookup Application Mapping
  ↓
Determine:
  - assignee_team_id  (dari mapping)
  - assigned_pics     (array, dari mapping)
  - assigned_to_id    (null jika multiple PIC, specific ID jika single PIC)
  - sla_deadline       (berdasarkan priority)
  ↓
Save tiket dengan auto-filled fields:
  - Team = auto
  - PIC(s) = auto
  - Category = user select
  - Status = Open (single PIC) / Queued (multiple PIC)
```

### 4.3 User Portal — Tiket List

User bisa melihat:

| Kolom | Keterangan |
|-------|-------------|
| ID Tiket | Format: HD-00001 |
| Subject | - |
| Application | Nama aplikasi |
| **🔴 BARU: Assigned Team** | Team yang handle (misal: "Team Ivan") |
| **🔴 BARU: Assigned PIC** | PIC yang handle (misal: "Ivan" atau "Team Joshua") |
| Status | Open / In Progress / Done / Closed |
| **🔴 BARU: SLA Status** | On Track / At Risk / Breached |
| **🔴 BARU: Timeline** | Klik untuk lihat history (created, assigned, in progress, resolved) |
| Created | Tanggal/waktu |

---

## 5. 🔴 BARU — Functional Requirements

### FR-1: User Submit Tiket
- FR-1.1: User harus bisa submit tiket dengan 6 fields (Subject, Application, Category, Description, Attachment, Priority)
- FR-1.2: **User TIDAK boleh pilih PIC secara manual**
- FR-1.3: **User TIDAK boleh pilih Team secara manual**
- FR-1.4: **User TIDAK boleh input Specific Task** — field ini hanya untuk internal
- FR-1.5: Sistem auto-route berdasarkan Application Mapping

### FR-2: Auto-Routing Engine
- FR-2.1: Setiap aplikasi punya mapping ke Team + PIC(s)
- FR-2.2: Single PIC: tiket langsung di-assign ke PIC tersebut
- FR-2.3: Multiple PIC: tiket masuk queue, semua PIC notified, first-claim-wins
- FR-2.4: Jika aplikasi tidak punya mapping → assigned ke "Unassigned Team" + Admin notified

### FR-3: Ticket Visibility (User)
- FR-3.1: User harus bisa lihat **Assigned Team**
- FR-3.2: User harus bisa lihat **Assigned PIC**
- FR-3.3: User harus bisa lihat **Ticket Timeline** (semua aktivitas kronologis)
- FR-3.4: User harus bisa lihat **SLA Status** (On Track / At Risk / Breached)

### FR-4: PIC Dashboard
- FR-4.1: PIC melihat inbox/queue tiket untuk timnya
- FR-4.2: PIC bisa **claim** tiket dari queue (menjadi owner)
- FR-4.3: PIC bisa update status: Open → In Progress → Done
- FR-4.4: PIC bisa tambahkan komentar (publik ke user, internal note)
- FR-4.5: **Specific Task** field tersedia untuk PIC/Admin (user tidak lihat)

### FR-5: Head/Admin Re-assign
- FR-5.1: Head bisa re-assign within team
- FR-5.2: Admin bisa re-assign ke team lain atau PIC lain

### FR-6: Multiple PIC Notification
- FR-6.1: Semua PIC di array `assigned_pics` menerima notifikasi saat tiket baru masuk
- FR-6.2: Notifikasi berisi: ticket ID, subject, application, link ke inbox
- FR-6.3: Tidak ada duplicate handling — first claim wins

---

## 6. 🔴 BARU — Ticket Lifecycle

```
                        ┌─────────────┐
                        │   QUEUED    │
                        │ (multi PIC) │
                        └──────┬──────┘
                               │ PIC claims
                               ↓
┌──────┐    Submit    ┌─────────────┐    Update     ┌─────────────┐
│ OPEN │─────────────→│ SINGLE PIC  │─────────────→│ IN PROGRESS │
└──────┘              │ or CLAIMED  │              └──────┬──────┘
                      └─────────────┘                     │
                                                         ↓
                                              ┌─────────────────────┐
                                              │        DONE         │
                                              │ (user notified,     │
                                              │  rating available)  │
                                              └──────────┬──────────┘
                                                         │ User close / Admin close
                                                         ↓
                                              ┌─────────────────────┐
                                              │       CLOSED        │
                                              └─────────────────────┘
```

### Status Definitions

| Status | Keterangan |
|--------|-------------|
| **Open** | Tiket baru, single PIC assigned, belum ada aktivitas |
| **Queued** | Tiket baru, multiple PIC, menunggu claim |
| **In Progress** | PIC sudah handle, sedang bekerja |
| **Done** | Masalah selesai, menunggu konfirmasi user |
| **Closed** | Tiket selesai dan ditutup |

### SLA Calculation

| Priority | Target | Warning (75%) | Breach |
|----------|--------|---------------|--------|
| Critical | 2 jam | 1.5 jam | 2+ jam |
| High | 8 jam | 6 jam | 8+ jam |
| Medium | 24 jam | 18 jam | 24+ jam |
| Low | 72 jam | 54 jam | 72+ jam |

---

## 7. Database Schema

### 7.1 Tabel Utama

```sql
-- ============================================================
-- PROFILES — User accounts
-- ============================================================
create table if not exists profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text unique not null,
  name        text not null,
  initials    text,
  role        text not null check (role in ('admin', 'pic', 'user')),
  dept        text,
  team_id     text,        -- references teams.id
  is_head     boolean default false,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

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
-- PICs (Team Members) — links aplikasi ke PIC
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
-- 🔴 BARU: APPLICATION ROUTING RULES
-- ============================================================
create table if not exists app_routing (
  id          uuid primary key default gen_random_uuid(),
  app_name    text not null,       -- e.g., "[PRJ] - Project System"
  app_prefix  text,                -- e.g., "PRJ"
  team_id     text references teams(id),
  -- Single PIC atau first PIC ( untuk multiple, ada pivot table)
  primary_pic_id text references pics(id),
  created_by  uuid references profiles(id),
  created_at  timestamptz default now()
);

-- ============================================================
-- 🔴 BARU: MULTI-PIC MAPPING (pivot table)
-- ============================================================
create table if not exists app_routing_pics (
  id          uuid primary key default gen_random_uuid(),
  app_routing_id uuid references app_routing(id) on delete cascade,
  pic_id      text references pics(id),
  created_at  timestamptz default now()
);

-- ============================================================
-- TICKETS
-- ============================================================
create table if not exists tickets (
  id              text primary key,  -- e.g., "HD-00001"
  subject         text not null,
  body            text,
  from_email      text not null,
  from_name       text,
  dept            text,
  category        text,
  app             text,              -- application name
  -- 🔴 BARU: Routing fields (auto-filled by system)
  assignee_team_id text references teams(id),
  assigned_pics    text[],           -- 🔴 BARU: Array of pic_ids ["p-ivan", "p-apri"]
  assigned_to_id   text,            -- 🔴 BARU: Owner (null if queued)
  -- Specific task — INTERNAL ONLY (user tidak lihat)
  specific_task    text,
  priority        text not null default 'Medium',
  status          text not null default 'Open',
  sla_deadline    timestamptz,
  sla_warning_at  timestamptz,
  resolved_at     timestamptz,
  closed_at       timestamptz,
  csat            integer,          -- rating 1-5
  created_by      uuid references profiles(id),
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- ============================================================
-- COMMENTS
-- ============================================================
create table if not exists comments (
  id              uuid primary key default gen_random_uuid(),
  ticket_id       text not null references tickets(id) on delete cascade,
  author_id       uuid references profiles(id),
  author_name     text,
  body            text not null,
  is_internal     boolean default false,  -- 🔴 BARU: Internal notes
  attachment_url  text,
  created_at      timestamptz default now()
);

-- ============================================================
-- 🔴 BARU: TICKET TIMELINE (activity log)
-- ============================================================
create table if not exists ticket_timeline (
  id          uuid primary key default gen_random_uuid(),
  ticket_id   text not null references tickets(id) on delete cascade,
  event_type  text not null,  -- created, assigned, claimed, in_progress, commented, resolved, closed
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
  pic_id      text,              -- target PIC
  user_id     uuid references profiles(id),
  type        text,             -- new_ticket, mentioned, assigned, sla_warning, sla_breach
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
-- SLA RULES (Admin configurable)
-- ============================================================
create table if not exists sla_rules (
  id          uuid primary key default gen_random_uuid(),
  priority    text unique not null,
  target_hours integer not null,
  warning_percent integer default 75,
  created_at  timestamptz default now()
);
```

### 7.2 Row Level Security (RLS)

| Tabel | User | PIC | Head | Admin |
|-------|------|-----|------|-------|
| `profiles` | read own | read team | read team | read/write all |
| `teams` | read | read | read/write | read/write |
| `pics` | read | read | read | read/write |
| `app_routing` | read | read | read | read/write |
| `tickets` | read own | read team | read team | read/write all |
| `comments` | read own ticket (public only) | read team (all) | read team | read/write all |
| `ticket_timeline` | read own | read team | read team | read/write all |
| `notifications` | read own | read team | read team | read/write all |
| `kb_articles` | read published | read published | read/write own | read/write all |

### 7.3 Indexes

```sql
create index idx_tickets_status          on tickets(status);
create index idx_tickets_team            on tickets(assignee_team_id);
create index idx_tickets_assigned_pics   on tickets using any(assigned_pics);
create index idx_tickets_owner           on tickets(assigned_to_id) where assigned_to_id is not null;
create index idx_tickets_created_at      on tickets(created_at desc);
create index idx_tickets_sla_warning    on tickets(sla_warning_at) where status not in ('Done', 'Closed');
create index idx_comments_ticket         on comments(ticket_id);
create index idx_timeline_ticket         on ticket_timeline(ticket_id, created_at);
create index idx_notifications_user      on notifications(user_id, is_read);
create index idx_notifications_pic       on notifications(pic_id, is_read);
create index idx_notifications_team      on notifications(team_id, is_read);
```

---

## 8. 🔴 BARU — API Design

### 8.1 Tiket Submit (User)

```
POST /api/tickets
Authorization: Bearer <token>
Content-Type: multipart/form-data

Body:
  - subject: string (required)
  - app: string (required) — application name dari dropdown
  - category: string (required)
  - description: string (required)
  - priority: string (optional, default: "Medium")
  - attachments: File[] (optional)

Response:
{
  "success": true,
  "ticket": {
    "id": "HD-00042",
    "subject": "...",
    "assignee_team_id": "team-ivan",
    "assigned_pics": ["p-ivan", "p-apri"],
    "assigned_to_id": null,  // null if multi-PIC
    "status": "Open" or "Queued",
    "sla_deadline": "2026-06-01T10:00:00Z"
  }
}
```

### 8.2 Claim Tiket (PIC)

```
POST /api/tickets/[id]/claim
Authorization: Bearer <token> (PIC/Head role)

Response:
{
  "success": true,
  "ticket": {
    "id": "HD-00042",
    "assigned_to_id": "p-ivan",  // current user
    "status": "In Progress",
    "claimed_at": "2026-06-01T09:30:00Z"
  }
}

Error (already claimed):
{
  "success": false,
  "error": "Ticket already claimed by another PIC"
}
```

### 8.3 Update Status (PIC)

```
PATCH /api/tickets/[id]
Authorization: Bearer <token>
{
  "status": "In Progress" | "Done",
  "specific_task": "string"  // internal only, optional
}

→ Triggers timeline entry + notification to user (if Done)
```

### 8.4 Get Tiket List

```
GET /api/tickets
Query params:
  - role: "user" | "pic" | "admin"
  - status: string (optional)
  - team_id: string (optional, for PIC)
  - page: number
  - limit: number

Response:
{
  "tickets": [...],
  "total": 100,
  "page": 1,
  "pages": 10
}
```

### 8.5 Get Tiket Detail

```
GET /api/tickets/[id]
Authorization: Bearer <token>

Response:
{
  "ticket": {...},
  "comments": [...],
  "timeline": [...],
  "assigned_pic_details": [...]  // names, emails of all assigned PICs
}
```

### 8.6 Get User's Own Tikets

```
GET /api/tickets/my
Authorization: Bearer <token> (User role)

Response:
{
  "tickets": [
    {
      "id": "HD-00042",
      "subject": "...",
      "app": "[PRJ] - Project System",
      "assignee_team_name": "Team Ivan",
      "assigned_pic_names": ["Ivan", "Apri"],
      "assigned_to_name": "Ivan",  // owner, or null if queued
      "status": "In Progress",
      "sla_status": "On Track",
      "timeline_preview": [...]
    }
  ]
}
```

---

## 9. 🔴 BARU — UI Specification

### 9.1 User Portal

**Submit Form:**

```
┌─────────────────────────────────────────────────────┐
│  📝 Submit Tiket Baru                                │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Subject *                                          │
│  ┌─────────────────────────────────────────────┐   │
│  │ Laptop tidak bisa menyala                    │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  Application *                                      │
│  ┌─────────────────────────────────────────────┐   │
│  │ [Pilih Aplikasi]                         ▼  │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  Category *                                         │
│  ┌─────────────────────────────────────────────┐   │
│  │ Hardware                                ▼  │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  Description *                                      │
│  ┌─────────────────────────────────────────────┐   │
│  │                                             │   │
│  │                                             │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  Attachment                                         │
│  ┌─────────────────────────────────────────────┐   │
│  │          📎 Drop files here or click       │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  Priority (optional override)                       │
│  ┌─────────────────────────────────────────────┐   │
│  │ Medium (Default)                        ▼  │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │              📤 Submit Tiket                │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**NOTE:**
- ❌ NO PIC dropdown (removed)
- ❌ NO Team dropdown (removed)
- ❌ NO Specific Task field (internal only)
- ✅ After picking Application → system shows "Akan di-assign ke Team Ivan" preview

**Tiket List:**

```
┌──────────────────────────────────────────────────────────────────────────┐
│  📋 Tiket Saya                                              [🔔 3]       │
├──────────────────────────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │ HD-00042  │  Laptop tidak bisa menyala                            │  │
│  │           │  [PRJ] - Project System                               │  │
│  │           │  Team: Team Ivan  │  PIC: Ivan                        │  │
│  │           │  Status: 🔵 In Progress  │  SLA: 🟢 On Track            │  │
│  │           │  [Lihat Timeline]                                     │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │ HD-00041  │  Error di billing residential                         │  │
│  │           │  [TMD] - Billing System                                │  │
│  │           │  Team: Team Joshua  │  PIC: Team Joshua (Queued)       │  │
│  │           │  Status: 🟡 Open  │  SLA: 🟢 On Track                   │  │
│  │           │  [Lihat Timeline]                                     │  │
│  └────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘
```

### 9.2 PIC Dashboard

**Inbox/Queue:**

```
┌──────────────────────────────────────────────────────────────────────────┐
│  🏠 Inbox  │  🎯 Tugas Saya  │  📊 Team Stats  │  🔍 Search            │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │  🔵 QUEUE                     2 tiket menunggu claim              │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │  HD-00042  │  Laptop tidak bisa menyala                           │  │
│  │            │  Aplikasi: [PRJ] - Project System                      │  │
│  │            │  Kategori: Hardware  │  Priority: Medium              │  │
│  │            │  Submit: 2026-05-31 14:30  │  SLA: 24 jam              │  │
│  │            │                                                      │  │
│  │  ┌─────────────────────────────────────┐                          │  │
│  │  │         [ 🤚 Claim Tiket ]          │  ← First PIC to click      │  │
│  │  └─────────────────────────────────────┘  becomes owner              │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │  🟢 IN PROGRESS               5 tiket sedang ditangani              │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │  HD-00038  │  Error login CRM                                     │  │
│  │            │  Owner: Anda (Ivan)  │  Since: 2 jam                  │  │
│  │            │  [ Lihat Detail ]                                   │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### 9.3 Ticket Detail View

```
┌──────────────────────────────────────────────────────────────────────────┐
│  ← Kembali ke Inbox                                                     │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  HD-00042: Laptop tidak bisa menyala                                     │
│  ════════════════════════════════════════════════════════════════════   │
│                                                                          │
│  📋 Info Tiket                                                          │
│  ────────────────────────────────────────────────────────────────────   │
│  Submit oleh:    Andi (andi@lippoland.id)                                │
│  Aplikasi:       [PRJ] - Project System                                   │
│  Kategori:       Hardware                                                 │
│  Priority:       Medium                                                   │
│  Status:         🔵 In Progress                                          │
│                                                                          │
│  📦 Assigned Team:    Team Ivan                                          │
│  👤 Assigned PIC:     Ivan (Owner)                                       │
│  ⏱️ SLA:              🟢 On Track (18 jam tersisa)                        │
│                                                                          │
│  📎 Attachments: [screenshot-error.png]                                  │
│                                                                          │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  📜 Timeline                                                            │
│  ────────────────────────────────────────────────────────────────────   │
│  ┌────────────────────────────────────────────────────────────────┐      │
│  │ 🟢 2026-05-31 14:30  Ticket created                           │      │
│  │    System auto-assigned to Team Ivan                           │      │
│  │    Assigned PICs: Ivan, Apri                                   │      │
│  └────────────────────────────────────────────────────────────────┘      │
│  ┌────────────────────────────────────────────────────────────────┐      │
│  │ 🔵 2026-05-31 15:00  Ivan claimed this ticket                  │      │
│  │    Ticket moved from queue to In Progress                       │      │
│  └────────────────────────────────────────────────────────────────┘      │
│  ┌────────────────────────────────────────────────────────────────┐      │
│  │ 💬 2026-05-31 16:00  Ivan commented                           │      │
│  │    "Sedang dicek, laptop masih garansi"                        │      │
│  └────────────────────────────────────────────────────────────────┘      │
│                                                                          │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  💬 Komentar                                                            │
│  ────────────────────────────────────────────────────────────────────   │
│  ┌────────────────────────────────────────────────────────────────┐      │
│  │ Ivan — 2026-05-31 16:00                                        │      │
│  │ Sedang dicek, laptop masih garansi. Akan kami proses klaim     │      │
│  │ service.                                                      │      │
│  └────────────────────────────────────────────────────────────────┘      │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────┐      │
│  │ [Tambahkan komentar...]                              [📤 Kirim] │      │
│  │                                                            ☑ Internal Note │      │
│  └────────────────────────────────────────────────────────────────┘      │
│                                                                          │
│  ┌────────────────────────────────────────────┐                         │
│  │  [🟢 Tandai Done]    [📝 Internal Notes]   │                         │
│  └────────────────────────────────────────────┘                         │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### 9.4 User Detail View (read-only for user)

**Yang user LIHAT:**

- ✅ Subject, Application, Category, Description, Attachment
- ✅ Assigned Team (nama tim)
- ✅ Assigned PIC (nama PIC atau "Team X - Queued")
- ✅ Timeline (semua aktivitas kronologis)
- ✅ SLA Status (On Track / At Risk / Breached)
- ✅ Komentar publik (tidak ada label "internal")
- ✅ Bisa beri rating saat status Done

**Yang user TIDAK LIHAT:**

- ❌ Specific Task (internal only)
- ❌ Internal Notes (komentar yang dicentang "Internal")
- ❌ Dropdown pilih PIC/Team
- ❌ Semua field yang mengizinkan user mengubah assignment

---

## 10. Technical Architecture

### Stack Production

```
Frontend    : Next.js 15 (App Router) + TypeScript
Styling     : CSS Custom Properties
Database    : Supabase Postgres
Auth        : Supabase Auth (email + password)
Realtime    : Supabase Realtime
File Upload : Supabase Storage
Email       : Resend (3.000 email/bulan gratis)
Deploy      : Netlify
```

### Folder Structure

```
src/
├── app/
│   ├── (auth)/
│   │   ├── login/
│   │   └── reset-password/
│   ├── (user)/
│   │   ├── submit-ticket/
│   │   └── my-tickets/
│   ├── (pic)/
│   │   ├── inbox/
│   │   ├── my-tasks/
│   │   └── ticket/[id]/
│   ├── (admin)/
│   │   ├── dashboard/
│   │   ├── users/
│   │   ├── routing-rules/
│   │   └── reports/
│   └── api/
│       ├── tickets/
│       ├── comments/
│       └── notifications/
├── components/
│   ├── ui/                    # Reusable UI components
│   ├── ticket-form/
│   ├── ticket-list/
│   ├── ticket-detail/
│   ├── timeline/
│   └── sla-indicator/
├── lib/
│   ├── supabase/
│   │   ├── client.ts
│   │   └── server.ts
│   ├── auth.ts
│   ├── routing-engine.ts      # Auto-route logic
│   └── sla-calculator.ts
├── hooks/
│   ├── useTickets.ts
│   ├── useRealtime.ts
│   └── useAuth.ts
└── types/
    └── index.ts
```

---

## 11. Realtime Channels

```
Channel: tickets-[team_id]    → PIC Dashboard (inbox, status update)
Channel: tickets-user-[uid]   → User Portal (status change, new comment)
Channel: notifications-[uid]   → Notif bell (new ticket, mentioned, SLA)
Channel: notifications-[team_id] → Team-wide notification
```

---

## 12. Email Events

| Event | Penerima | Template |
|-------|----------|----------|
| Tiket baru (Queued) | Semua PIC di team | NewTicketQueue |
| Tiket baru (Single) | PIC yang di-assign | NewTicketAssigned |
| Tiket claimed | User submitter | TicketClaimed |
| Status → Done | User submitter | TicketResolved |
| Komentar baru | User submitter | NewComment |
| SLA Warning (75%) | PIC owner + Head | SLAWarning |
| SLA Breach (100%) | PIC owner + Head + Admin | SLABreach |

---

## 13. Environment Variables

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

RESEND_API_KEY=
RESEND_FROM_EMAIL=helpdesk@lippoland.id

NEXT_PUBLIC_APP_URL=https://helpdesk.lippoland.id
```

---

## 14. Prioritas Implementasi

```
Phase 1 — Core Flow
  1. Database schema (teams, pics, app_routing, tickets, timeline)
  2. Auth (login, session, route protection)
  3. User submit form (simplified 6 fields)
  4. Auto-routing engine (app → team/pic mapping)
  5. Single PIC assignment (auto-assign, no queue)
  6. Multiple PIC queue system (claim logic)
  7. Ticket timeline display
  8. SLA status calculation & display
  9. User dapat lihat Assigned Team & PIC

Phase 2 — PIC Workflow
 10. PIC inbox/queue view
 11. Claim ticket action
 12. Update status (In Progress → Done)
 13. Comment system (public + internal note)
 14. Specific task field (internal only)
 15. Re-assign within team (Head only)

Phase 3 — Admin & Reporting
 16. Admin dashboard (stats, charts)
 17. Routing rules CRUD (Admin)
 18. SLA rules configuration (Admin)
 19. Reports with filters
 20. Export PDF/Excel

Phase 4 — Notifications & Polish
 21. Email notifications (Resend integration)
 22. Realtime sync
 23. SLA breach alert cron
 24. Import users CSV
 25. KB articles management
```

---

## 15. Open Questions (yang perlu stakeholder decide)

> Item-item di bawah ini perlu jawaban sebelum implementasi bisa lanjut.

| ID | Pertanyaan | Status |
|----|------------|--------|
| O1 | Multiple PIC: max berapa PIC per team? (rekomendasi: 5) | 🔴 OPEN |
| O2 | Queue claim: ada waktu expiry? (rekomendasi: 24 jam, lalu escalate ke admin) | 🔴 OPEN |
| O3 | Specific Task: apakah wajib diisi PIC saat claim, atau opsional? | 🟡 PENDING |
| O4 | Internal notes: apakah user harus bisa lihat ada "internal note" exists tapi isinya tidak? | 🟡 PENDING |
| O5 | Rating: apakah wajib sebelum user bisa close tiket? | 🔴 OPEN |

---

## 16. Compatibility Notes

**Jaga backward compatibility dengan:**

| Component | Notes |
|-----------|-------|
| Next.js 15 App Router | Gunakan server components where possible |
| TypeScript strict mode | Semua new types harus di-export |
| Supabase client | Gunakan `@supabase/ssr` untuk cookie-based auth |
| Supabase Realtime | Subscribe to team-specific channels, not global |
| Resend | React Email templates, bukan inline HTML |

---

*Dokumen ini diperbarui: 2026-05-31*  
*Post-Stakeholder Review v4 — `D:/helpdesk`*