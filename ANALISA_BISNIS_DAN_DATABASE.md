# Analisa Flow Bisnis & Celah Database — IT Helpdesk Ticketing System

> Dokumen ini dibuat dari hasil pembacaan menyeluruh terhadap source code (per **13 Juni 2026**).
> Tujuannya: (1) menjelaskan bagaimana aplikasi ini bekerja end-to-end, dan (2) mendaftar
> kekurangan/celah pada lapisan data (Supabase + localStorage) yang perlu diperhatikan
> sebelum aplikasi ini dipakai secara serius (bukan sekadar prototype).

---

## 1. Ringkasan Aplikasi & Arsitektur

**Stack**: Next.js (App Router) + TypeScript, di-deploy sebagai aplikasi client-heavy
("use client" di hampir semua halaman). Backend data store: **Supabase Postgres**
diakses langsung dari browser via `@supabase/supabase-js` dengan **anon key**
(`src/lib/supabase/client.ts`).

Status migrasi (per memory project): aplikasi sedang **hybrid** — master data
(teams, pics, categories, app_routing, sla_rules, kb_articles, app_users) sudah
pindah ke Supabase, **tiket** juga sudah pindah ke Supabase (`src/lib/ticket-store.ts`),
tapi **session login** masih 100% di `localStorage` (`itlk_session`), dan beberapa
state (notifikasi PIC, rating CSAT di UI) masih murni client-side / tidak pernah disimpan.

Tiga portal utama:

| Portal | Path | Role | File utama |
|---|---|---|---|
| Landing/hub | `/` | semua | `src/app/page.tsx` |
| Login | `/login` | semua | `src/app/login/page.tsx` |
| Karyawan (Submit & track tiket) | `/dashboard` | `user` | `src/app/dashboard/page.tsx` |
| IT/PIC (kelola tiket) | `/pic` | `pic` | `src/app/pic/page.tsx` |
| Admin (config, reporting) | `/admin` | `admin` | `src/app/admin/page.tsx` |

Footer halaman hub masih menulis *"stack: next.js + typescript + localStorage"* dan
*"50 tiket/hari · 4 PIC"* — sudah tidak akurat dibanding kondisi kode saat ini
(Supabase + 13 PIC di seed data).

---

## 2. Peran Pengguna & Autentikasi

Tiga role (`src/types/index.ts`): `'user' | 'pic' | 'admin'`.

### 2.1 Sumber akun

1. **`SEED_ACCOUNTS`** (`src/lib/account-store.ts`) — 14 akun hardcoded di source code:
   - 3 admin (`lady.yohana`, `eric.yonalis`, `viona` — domain `@ithelpdesk.com`)
   - 10 PIC tersebar di 5 tim
   - 2 sample user (Finance, Operations)
2. **`app_users`** (tabel Supabase) — akun yang didaftarkan Admin lewat menu **Import Pengguna** (CSV bulk import), termasuk kolom `default_password` (plaintext).

### 2.2 Proses login (`src/lib/auth.ts`)

```ts
export async function login(email, password) {
  const lower = email.toLowerCase().trim();
  if (!password) return { ok:false, error:'Email atau password salah...' };

  const seedAccount = SEED_ACCOUNTS.find(a => a.email.toLowerCase() === lower);
  const registered  = seedAccount ? null : await findAppUserByEmail(lower);

  if (!seedAccount && !registered) return { ok:false, error:'Email atau password salah...' };

  // ... password TIDAK PERNAH dibandingkan dengan apapun
  const session = { email: lower, name, role, picId, initials, loginAt };
  if (isBrowser()) localStorage.setItem('itlk_session', JSON.stringify(session));
  return { ok:true, session };
}
```

**Login hanya memverifikasi bahwa email terdaftar (di `SEED_ACCOUNTS` atau `app_users`) dan
bahwa field password tidak kosong.** Nilai password sama sekali tidak dicocokkan ke
`default_password` atau apapun. Lihat detail dampaknya di [§5.1](#51-tidak-ada-verifikasi-password---celah-kritis).

### 2.3 Session

`Session` (`src/types/index.ts`) disimpan sebagai JSON polos di `localStorage["itlk_session"]`:

```ts
{ email, name, role, picId, initials, loginAt }
```

Tidak ada token, signature, atau expiry — lihat [§5.3](#53-session-localstorage-mudah-dipalsukan).

### 2.4 Redirect setelah login (`getRedirectUrl`)

`admin → /admin`, `pic → /pic`, lainnya → `/dashboard`.

---

## 3. Flow Bisnis End-to-End

### 3.1 Portal Karyawan (`/dashboard`) — Submit & Tracking Tiket

**Submit tiket baru** (`SubmitModal` di `src/app/dashboard/page.tsx`):

1. User isi: **Subject**, **Aplikasi** (search-dropdown dari `apps[]`), **Tugas Spesifik**
   (search-dropdown dari `specificTasks[]`), **Body**, dan opsional **lampiran**
   (maks 5MB/file, disimpan sebagai base64 `dataUrl` — lihat [§6.4](#64-attachment-sebagai-base64-di-jsonb)).
2. ID tiket dibuat via `generateTicketId()` (`src/lib/utils.ts:54`):
   ```ts
   export function generateTicketId(): string {
     const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
     const rand = Math.floor(Math.random() * 900 + 100); // 100-999
     return `ITLK-${date}-${rand}`;
   }
   ```
3. **Tidak melalui `autoRoute()`** — PIC ditugaskan langsung dari `selectedApp.picId`
   (mapping statis App→PIC dari tabel `app_routing`), tanpa load-balancing.
4. **Priority selalu di-hardcode `'Medium'`**, `autoRouted: false` — meski ada mesin
   deteksi priority (`detectPriority`) di rule-engine, jalur Karyawan tidak memakainya.
5. Tiket di-`insertTicket()` ke Supabase, lalu (jika `emailConfig.enabled`) kirim
   notifikasi via EmailJS (`sendTicketEmail`).

**Tracking tiket** (`TicketDetailModal`):

- Daftar tiket milik user sendiri (filter by `from === session.email`), dengan status,
  SLA progress bar (`slaProgress()`), dan riwayat aktivitas.
- **Komentar publik** (`!c.isInternal`) ditampilkan + textarea balasan (Ctrl+Enter submit).
  `addComment()` melakukan **full-array replace**: ambil seluruh array `comments` &
  `activity`, append item baru, lalu `updateTicketFields(id, { comments, activity, updatedAt })`
  — lihat risiko di [§6.3](#63-jsonb-full-array-overwrite--lost-update).
- Untuk tiket **Done/Closed**, muncul UI rating **CSAT 1-5 bintang** — tapi nilainya
  **tidak pernah disimpan** ke field `csat` di DB. Lihat [§7.1](#71-csat-rating-dikumpulkan-tapi-tidak-pernah-disimpan).

### 3.2 Mesin Auto-Routing & Klasifikasi (`src/lib/rule-engine.ts`)

Dipakai hanya oleh **EmailSimulator** di portal PIC (bukan oleh Submit Karyawan).
`analyze(subject, body, liveData?, existingTickets)` melakukan:

1. **`detectApp(text, liveApps?)`** — cocokkan substring `keywords[]` tiap App
   terhadap `subject + body` (case-insensitive), pilih App dengan **keyword terpanjang**
   yang match (skor tertinggi). Default fallback: App pertama / "Lainnya".
2. **`detectTask(text)`** — sama, tapi terhadap `specificTasks[]` (~90 entri keyword
   Bahasa Indonesia).
3. **`detectPriority(text)`** — cek `priorityKeywords.critical` → `.high` → `.low`
   secara berurutan (substring match); jika tidak ada yang cocok → `Medium`
   (`confidence: 0.70`).
4. **`autoRoute(app, liveData?, existingTickets)`**:
   - Tentukan `team` dari `app.teamId`.
   - Kandidat PIC = anggota tim **selain head** (atau head jika tidak ada anggota lain).
   - Hitung beban tiap kandidat = jumlah tiket existing dengan
     `status ∈ {Open, In Progress, Pending}` dan `assignedToId === p.id`.
   - Pilih PIC dengan beban **paling kecil** (least-loaded / round-robin sederhana).
5. **`checkAutoClose(text)`** — substring match terhadap `closeKeywords` (~18 frasa,
   misalnya "sudah selesai", "thanks", "terima kasih sudah dibantu", dst).

Semua deteksi berbasis **substring matching sederhana** (tidak ada normalisasi typo,
stemming, atau NLP) — rentan **false positive/negative** jika kata kunci muncul di
konteks berbeda (contoh: keyword priority "urgent" di tanda tangan email akan
menaikkan priority tanpa maksud sebenarnya).

### 3.3 Portal PIC (`/pic`) — Workspace IT

**Pemilihan identitas PIC** — `currentPicId` di-inisialisasi dari `session.picId`,
tapi dapat diganti lewat `<select>` polos:

```tsx
<select value={currentPicId} onChange={e => setCurrentPicId(e.target.value)}>
  {allPics.map(p => <option key={p.id} value={p.id}>{p.name}{p.isHead ? ' ★' : ''}</option>)}
</select>
```

→ **Siapapun yang login sebagai role `pic` dapat "menjadi" PIC lain (termasuk team
head) hanya dengan memilih dari dropdown** — tidak ada pengecekan apakah email
login cocok dengan PIC tersebut. Lihat [§5.2](#52-impersonasi-pic-via-dropdown).

**Pengelolaan tiket** (`TicketDetail`):

- Tampilkan meta tiket, SLA progress bar, lampiran, **activity feed** (toggle
  `showActivity`), komentar (toggle internal vs publik via `isInternal`).
- Aksi: **"Terima Tiket"** (klaim tiket unassigned), **"Selesai"** (→ Done),
  dropdown 3-titik untuk transisi status lain (`In Progress`/`Pending`/`Revisi`/`Closed`).
- `addComment()` di sisi PIC juga memanggil `checkAutoClose()` saat membaca balasan
  user — jika cocok keyword, tiket otomatis pindah ke `Done`.

**EmailSimulator** — mensimulasikan email masuk:

1. User isi subject/body/from → `analyze()` → hasil klasifikasi (App, Task, Priority, Team, PIC).
2. Tiket baru dibuat dengan ID:
   ```ts
   const newId = `ITLK-${date}-${String(tickets.length+1).padStart(4,'0')}`;
   ```
   **Skema ID ini BERBEDA dari `generateTicketId()` yang dipakai Karyawan** —
   lihat [§6.5](#65-dua-skema-id-tiket-yang-berbeda--rawan-kolisi).

**NotificationPanel** — daftar notifikasi tiket baru, **diinisialisasi sekali**
dari tiket `Open` yang ada saat load (`notificationsInitialized` flag), state
murni di memory React — hilang saat refresh, tidak pernah disimpan ke DB.
Lihat [§7.3](#73-notifikasi-pic-tidak-persisten).

### 3.4 Status Lifecycle & SLA

```
Open ──► In Progress ──► Pending/Revisi ──► Done ──► Closed
   ▲___________________________│
   (boleh balik status manual via dropdown PIC)
```

- `TicketStatus = 'Open' | 'In Progress' | 'Pending' | 'Revisi' | 'Done' | 'Closed'`
- `TicketPriority = 'Low' | 'Medium' | 'High' | 'Critical'`
- **SLA rules** (`sla_rules` table / `slaRules` di `data.ts`):

  | Priority | Target Hours | Warning % |
  |---|---|---|
  | Critical | 2 | 75 |
  | High | 8 | 75 |
  | Medium | 24 | 75 |
  | Low | 72 | 75 |

- `slaProgress(createdAt, deadline)` (`src/lib/utils.ts:26`) menghitung:
  ```ts
  pct = min(100, (now - created) / (due - created) * 100)
  breached = now > due
  status = breached ? 'breach' : pct > 75 ? 'warn' : 'ok'
  ```
  Dihitung **murni di client** setiap render — tidak ada job/cron server-side
  yang menandai tiket breach, jadi status SLA hanya "benar" selama ada user yang
  membuka halaman tersebut.

### 3.5 Komentar, Activity Log & Auto-Close

- `Comment { id, authorId, authorName, authorInitials, time, body, isInternal }`
- `ActivityItem { type: 'system'|'comment'|'status_change', time, text?, who?, isInternal? }`
- Setiap aksi (ganti status, balasan, klaim tiket) menambah entri ke `activity[]`
  **dan** (untuk komentar) ke `comments[]`, lalu seluruh array ditulis ulang via
  `updateTicketFields()`.
- **Auto-close**: jika balasan Karyawan mengandung salah satu `closeKeywords`,
  tiket otomatis berstatus `Done` + activity log "Auto-closed by system".

### 3.6 CSAT (Customer Satisfaction)

- UI bintang 1-5 muncul untuk tiket `Done`/`Closed` di portal Karyawan.
- Skema DB **sudah punya kolom** `tickets.csat integer check (csat >= 1 and csat <= 5)`.
- Tapi **tidak ada satupun call** ke `updateTicketFields(id, { csat: rating })` —
  rating yang dipilih user hanya disimpan di `useState` lokal komponen, hilang
  saat modal ditutup.
- Admin Dashboard menampilkan **"4.6/5 dari 142 rating"** sebagai **angka statis
  hardcoded** — tidak terhubung ke kolom `csat` sama sekali.

### 3.7 Knowledge Base (KB)

- Tabel `kb_articles` (title, body, category, is_published, views, timestamps).
- Admin → **KB Manager**: CRUD artikel (title, category, body, published flag).
- Tidak ditemukan UI/halaman untuk Karyawan **membaca** KB (tidak ada
  halaman `/kb` publik) — artinya fitur KB saat ini **hanya bisa dikelola dari
  admin**, belum ada consumer-facing page yang memanfaatkannya. (Field `views`
  juga tidak pernah di-increment oleh kode manapun.)

### 3.8 Portal Admin (`/admin`)

| Halaman | Fungsi | Catatan |
|---|---|---|
| **Dashboard** | Statistik ringkas | `weeklyData` array statis 7 hari, teks **"94%"** SLA compliance, **"+12% dari bulan lalu"**, CSAT **"4.6/5 (142 rating)"** — semuanya hardcoded, lihat [§7.2](#72-dashboard--reporting-admin-berisi-data-fiktif) |
| **Reporting** | Laporan performa | **Seluruhnya fiktif/statis**: avg response 12 menit, avg resolution 3.2 jam, reopen rate 4.1%, FTR 87%, tabel performa PIC pakai array posisi hardcoded `[42,38,35,29]`, `['2.8 jam',...]`, dst — diindex ke `allPics.slice(0,4)` tanpa relasi nyata ke data tiket |
| **KB Manager** | CRUD artikel KB | Berfungsi normal via `kb_articles` |
| **All Tickets** | Edit/hapus semua tiket | `TicketEditModal` bisa ubah kategori/tim/PIC/priority/status/app/tanggal/specific task/subject. `SEED_TICKET_IDS` melindungi 5 tiket seed dari bulk-delete "Hapus Non-Seed" maupun delete per-baris |
| **Routing Rules** | Mapping App → PIC | Editor `app_routing.primary_pic_id`, pagination 15/halaman, via `setAppPic()` |
| **Config** | Categories + SLA Rules | CRUD kategori (kode 2-6 char uppercase, warna dari `COLOR_PALETTE`), editor SLA (`targetHours`, `warningPercent`) |
| **Import Pengguna** | CSV bulk import User/PIC | `parseCsv()` → `defaultPassword = "IT@" + 5HurufNamaPertama + "2026"`, lalu `adminCreateAccount` (+ `createPic` jika role PIC) + `markAppUserEmailSent`. Email "selamat datang" hanya **disimulasikan** (tidak benar-benar terkirim) — dan dokumentasi inline mengakui *"bisa langsung login dengan email tersebut (password apa saja, sesuai mode prototype ini)"* |
| **Users** | CRUD PIC & Karyawan | `deactivatePic(id)` sebenarnya **hard delete** (`DELETE FROM pics WHERE id=...`), bukan soft-deactivate meski namanya begitu. Hapus akun seed diblok |
| **Cutoff** | Bulk transisi Done→Closed | Tambah activity log, support print-to-PDF via browser |
| **Aplikasi** | CRUD daftar App | Format nama `[PREFIX] - Nama`, pagination |
| **Weekly Report** | Analitik range tanggal + export PPTX | Volume/hari, distribusi PIC, top app, kategori tugas, aging tickets ≥4 hari (flag eskalasi); export via POST `/api/export-ppt` |

---

## 4. Struktur Database (Supabase Postgres)

Skema saat ini: **`supabase/schema.sql` v5 "Simplified prototype (2026-06-13)"**.

### 4.1 Daftar Tabel

| Tabel | PK | Catatan |
|---|---|---|
| `teams` | `id text` | `head_pic_id`, `head_name`, `head_email`, `role` |
| `pics` | `id text` | FK `team_id → teams`, `is_head`, `sub_team`, **`is_active boolean default true` (tidak pernah dipakai)** |
| `categories` | `id text` | `name`, `color` |
| `app_routing` | `uuid` | FK `team_id → teams`, FK `primary_pic_id → pics`, `app_keywords text[]`, `is_active` (tidak dipakai konsisten) |
| `sla_rules` | `uuid` | `priority unique`, `target_hours`, `warning_percent` |
| `tickets` | `id text` | Lihat [§4.2](#42-desain-jsonb-pada-tickets) |
| `app_users` | `id text` | `email unique`, `role check ('user','pic')`, **`default_password text not null`** (plaintext) |
| `kb_articles` | `uuid` | `title`, `body`, `category`, `is_published`, `views` |

Tabel v4 yang **sudah dihapus** (drop table cascade): `comments`, `ticket_timeline`,
`notifications`, `audit_log`, `import_queue`, `app_routing_pics`, `profiles`.
→ Tidak ada lagi tabel untuk audit trail atau notifikasi terstruktur.

### 4.2 Desain jsonb pada `tickets`

```sql
create table tickets (
  id                    text primary key,
  subject               text not null,
  body                  text,
  from_email            text not null,
  from_name             text,
  dept                  text,
  cc                    text[],
  category              text,             -- nama kategori, BUKAN FK
  app                   text,             -- nama app, BUKAN FK
  specific_task         text,
  priority              text not null default 'Medium'
                          check (priority in ('Low','Medium','High','Critical')),
  assignee_team_id      text,             -- BUKAN FK ke teams
  assigned_to_id        text,             -- BUKAN FK ke pics
  assigned_name         text,             -- nama PIC, denormalized
  status                text not null default 'Open'
                          check (status in ('Open','In Progress','Pending','Revisi','Done','Closed')),
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
```

`src/lib/ticket-store.ts` melakukan mapping `TicketRow ↔ Ticket` (snake_case ↔
camelCase) via `mapTicketRow` / `ticketToRow` / `partialTicketToRow`. Saat tabel
kosong, `fetchTickets()` otomatis **seed 5 tiket** dari `seedTickets` (`data.ts`).

### 4.3 Row Level Security (RLS)

Setiap tabel: `alter table X enable row level security;` lalu:

```sql
create policy "X_read"  on X for select using (true);
create policy "X_write" on X for all    using (true) with check (true);
```

→ **RLS aktif tapi policy-nya membuka akses penuh ke role `anon`** untuk SELECT,
INSERT, UPDATE, DELETE pada **semua 8 tabel**, termasuk `app_users`
(berisi `default_password`) dan `tickets` (berisi data internal/komentar internal PIC).

---

## 5. Celah Keamanan

### 5.1 Tidak Ada Verifikasi Password — CELAH KRITIS

`login()` (`src/lib/auth.ts:21-56`) hanya mengecek:
1. `password` tidak boleh string kosong.
2. `email` ada di `SEED_ACCOUNTS` **atau** `app_users`.

Tidak ada langkah pencocokan terhadap `default_password` atau hash apapun.

**Dampak**: siapa saja yang tahu/menebak alamat email **admin** (`@ithelpdesk.com`,
mudah ditebak dari pola `nama.depan@ithelpdesk.com`) bisa login sebagai admin
dengan password sembarang (misalnya `"x"`), lalu mengakses seluruh portal Admin
(reporting, config, user management, cutoff, dst).

### 5.2 Impersonasi PIC via Dropdown

Di `/pic`, `currentPicId` bisa diganti bebas lewat `<select>` yang berisi
**semua PIC**, termasuk team head, **tanpa validasi terhadap `session.email`**.
Kombinasi dengan §5.1: penyerang cukup tahu **satu** email PIC mana pun untuk
login sebagai role `pic`, lalu memilih identitas PIC lain (termasuk head tim lain)
dan mengklaim/menutup/membalas tiket atas nama orang tersebut.

### 5.3 Session `localStorage` Mudah Dipalsukan

`Session` = `{ email, name, role, picId, initials, loginAt }` disimpan polos di
`localStorage["itlk_session"]`, tanpa signature/HMAC. Siapapun dengan akses
DevTools (atau XSS apa pun di app) dapat:
```js
localStorage.setItem('itlk_session', JSON.stringify({ email:'admin@ithelpdesk.com', role:'admin', ... }))
```
lalu reload — middleware/route guard (jika ada) yang mengandalkan field ini di
client-side bisa dilewati seluruhnya.

### 5.4 RLS Terbuka + Anon Key di Client = Akses Penuh ke DB

`src/lib/supabase/client.ts` menggunakan `NEXT_PUBLIC_SUPABASE_ANON_KEY` (otomatis
ter-bundle ke JS yang dikirim ke browser). Dikombinasikan dengan policy
`using (true) with check (true)` di [§4.3](#43-row-level-security-rls), **siapa pun
yang punya URL Supabase project + anon key (yang ada di bundle JS publik) dapat
melakukan query REST langsung ke Supabase** — baca/tulis/hapus apa pun di 8 tabel,
**tanpa login ke aplikasi sama sekali**. Ini mencakup:
- Membaca seluruh `app_users.default_password` (plaintext).
- Membaca seluruh `tickets.comments` termasuk komentar internal PIC (`isInternal: true`).
- Menghapus/mengubah tiket, kategori, routing rules, SLA, dst.

### 5.5 Plaintext Password di `app_users.default_password`

Kolom `default_password text not null` menyimpan password CSV-import
(`IT@${5HurufNama}2026`) **dalam bentuk plaintext** — dan (per §5.1) **tidak
pernah dipakai untuk verifikasi login**, jadi eksistensinya murni risiko
(exposure) tanpa fungsi pengaman apapun. Pola password juga **mudah ditebak**
(`IT@<5 huruf nama>2026`).

### 5.6 Kredensial Hardcoded di Source (`src/lib/data.ts`)

```ts
emailConfig: {
  enabled: ...,
  publicKey:  'aGluLAZ_MmdI2H_Uy',   // fallback hardcoded
  serviceId:  'service_3j2q4fe',
  templateId: 'template_pz8ss63',
  fromEmail:  'vinraylibra23@gmail.com',
  notifyEmail:'yudisyudis0@gmail.com',
}
```
Meskipun ada override via `process.env.NEXT_PUBLIC_*`, **fallback value adalah
kredensial nyata** yang ikut ter-commit ke repo dan ter-bundle ke client JS.
EmailJS public key relatif rendah-risiko by design, tapi `serviceId`/`templateId`
yang spesifik bisa dipakai pihak luar untuk **mengirim email atas nama service
ini** (spam relay) jika EmailJS service tidak dibatasi domain.

---

## 6. Celah Integritas Data & Konkurensi

### 6.1 Denormalisasi Tanpa Foreign Key di `tickets`

Kolom `category`, `app`, `assignee_team_id`, `assigned_to_id`, `assigned_name`
pada `tickets` adalah **text bebas**, **tidak ada FK** ke `categories`,
`app_routing`, `teams`, atau `pics`.

**Konsekuensi**:
- Jika admin **rename** App/Category/PIC (`updateApp`, `updateCategory`,
  `updatePic`), tiket lama tetap menyimpan **nama lama** — laporan/filter by
  app/category jadi tidak konsisten antara data lama vs baru.
- Jika admin **hapus** App/Category/PIC (`deleteApp`, `deleteCategory`,
  `deactivatePic`), tiket yang mereferensikan ID/nama tersebut menjadi
  **dangling reference** — tidak ada cascade, tidak ada constraint yang mencegah.
- `updateApp(id, { name, prefix })` (`src/lib/master-data.ts:357-360`) **hanya**
  mengubah `app_name` & `app_prefix` — **`app_keywords` dan `team_id` tidak bisa
  diupdate** lewat fungsi ini sama sekali (UI Aplikasi mungkin terlihat berhasil
  edit, tapi keyword/team lama tetap tersimpan).

### 6.2 `deactivatePic` = Hard Delete, Bukan Soft-Delete

```ts
export async function deactivatePic(id: string): Promise<void> {
  const { error } = await supabase.from('pics').delete().eq('id', id);
  logError('deactivatePic', error);
}
```
Schema sudah punya kolom `pics.is_active boolean default true` (+ index
`idx_pics_active`) yang **mengindikasikan desain soft-delete**, tapi
implementasinya **DELETE permanen**. Akibatnya:
- Riwayat tiket yang `assigned_to_id`/`assigned_name` merujuk ke PIC yang
  dihapus jadi kehilangan konteks (nama masih ada di kolom denormalized
  `assigned_name`, tapi `assigned_to_id` jadi orphan).
- Tidak bisa "mengaktifkan kembali" PIC — harus dibuat ulang dengan ID baru
  (riwayat lama tidak otomatis terhubung lagi).

### 6.3 jsonb Full-Array Overwrite — Lost Update

`comments`, `activity`, `attachments` disimpan sebagai **jsonb array tunggal**.
Setiap penambahan komentar/aktivitas dilakukan dengan pola:

```ts
const comments = [...ticket.comments, newComment];
const activity = [...ticket.activity, newActivity];
await updateTicketFields(id, { comments, activity, updatedAt });
```

Ini adalah **read-modify-write tanpa optimistic lock / version check**. Jika dua
pihak (misal Karyawan dan PIC) membalas tiket yang sama dalam jendela waktu yang
berdekatan (sebelum polling 20 detik menyegarkan data masing-masing), **balasan
yang ditulis lebih dulu akan ter-overwrite** oleh write kedua yang berbasis
snapshot lama — race condition klasik *lost update*. Tidak ada `updated_at`
check, tidak ada Postgres function/RPC `jsonb_insert`/append yang atomik.

### 6.4 Attachment sebagai Base64 di jsonb

`Attachment { name, type, size, dataUrl }` — file (maks 5MB) disimpan sebagai
**base64 string di dalam kolom jsonb `tickets.attachments`**. Implikasi:
- Ukuran row `tickets` bisa membengkak signifikan (base64 ≈ 1.37× ukuran asli),
  memperlambat `fetchTickets()` yang mengambil **semua kolom semua tiket**
  setiap 20 detik (`POLL_INTERVAL_MS`).
- Tidak ada Supabase Storage / CDN — setiap polling refetch mengirim ulang
  seluruh payload base64 ke client, termasuk untuk tiket yang tidak sedang dibuka.

### 6.5 Dua Skema ID Tiket yang Berbeda — Rawan Kolisi

| Jalur pembuatan tiket | Skema ID | Risiko |
|---|---|---|
| Karyawan submit (`dashboard/page.tsx:91`, via `generateTicketId()`) | `ITLK-YYYYMMDD-NNN` (NNN = random 100-999) | Hanya **900 kombinasi/hari** — pada volume tinggi, `Math.random()` bisa menghasilkan ID yang sudah dipakai hari itu (tidak ada cek uniqueness sebelum insert; `tickets.id` adalah **primary key**, sehingga insert kedua akan **gagal dengan error** yang hanya di-`logError`, tidak ditampilkan ke user) |
| PIC EmailSimulator (`pic/page.tsx:637`) | `ITLK-YYYYMMDD-${String(tickets.length+1).padStart(4,'0')}` | Berbasis **panjang array tiket yang sudah ter-load di client** — jika dua PIC membuka EmailSimulator bersamaan, atau jika `tickets` state belum mencakup tiket terbaru (karena polling), **ID yang sama bisa digenerate dua kali** → insert kedua gagal (PK conflict) |

Tidak ada sequence/identity di DB untuk ID tiket (`tickets.id` adalah `text`,
diisi dari client) — generasi ID sepenuhnya tanggung jawab client dan **rawan
collision + tidak konsisten formatnya** antar dua jalur pembuatan tiket.

### 6.6 Polling, Bukan Realtime

`useTickets()` (`src/lib/ticket-store.ts`) melakukan `fetchTickets()` setiap
**20 detik** + saat `window focus`. Tidak memanfaatkan Supabase Realtime
(`supabase.channel().on('postgres_changes', ...)`). Dampak:
- Update dari PIC/Admin baru terlihat oleh Karyawan setelah ≤20 detik (atau saat
  tab difokuskan kembali) — memperbesar jendela race condition di §6.3.
- Setiap tab/browser terbuka memicu full-table fetch tiap 20 detik — biaya
  request/egress Supabase bertambah linear dengan jumlah user aktif.

### 6.7 `auto_route_confidence` sebagai jsonb Tanpa Skema Tervalidasi

Kolom `tickets.auto_route_confidence jsonb` menyimpan
`{ app, task, priority, route? }` (lihat `Ticket.autoRouteConfidence` di
`src/types/index.ts:47`) — tidak ada `check` constraint atau tipe terstruktur di
DB, jadi struktur object ini hanya "dijamin" oleh konvensi TypeScript di client;
perubahan shape di masa depan tidak akan tervalidasi oleh DB.

---

## 7. Fitur Tidak Berfungsi / Data Palsu

### 7.1 CSAT Rating Dikumpulkan tapi Tidak Pernah Disimpan

Lihat [§3.6](#36-csat-customer-satisfaction). Kolom `tickets.csat` ada dan
ter-constraint (`1-5`), UI mengumpulkan rating, tapi **tidak ada path kode yang
menulis ke kolom ini**. Dashboard Admin menampilkan **"4.6/5 dari 142 rating"**
sebagai string statis — angka ini tidak berasal dari query apapun ke `tickets.csat`.

### 7.2 Dashboard & Reporting Admin Berisi Data Fiktif

- `DashboardPage`: `weeklyData` (array statis 7 hari), `"94%"` SLA compliance,
  `"+12% dari bulan lalu"`, CSAT `"4.6/5 (142 rating)"`.
- `ReportingPage`: **seluruh halaman** — avg response 12 menit, avg resolution
  3.2 jam, reopen rate 4.1%, first-time resolution 87%, tabel performa PIC
  (`[42,38,35,29]`, `['2.8 jam',...]`, `[96,94,98,88]`, `[4.7,4.5,4.8,4.3]`)
  yang diindex secara **posisional** ke `allPics.slice(0,4)` — tidak terkait
  identitas PIC sesungguhnya maupun data tiket aktual.

→ Risiko utama: **decision-maker yang melihat halaman ini bisa salah ambil
keputusan** karena mengira angka tersebut representasi data real.

### 7.3 Notifikasi PIC Tidak Persisten

`NotificationPanel` di `/pic` diisi sekali dari tiket `Open` yang ada saat load
(`notificationsInitialized`), disimpan di React state. Tidak ada tabel
`notifications` (sudah di-drop dari schema v5). Refresh halaman → notifikasi
hilang/reset; tidak ada riwayat "sudah dibaca/belum dibaca" yang persisten.

### 7.4 Knowledge Base Tanpa Consumer

Tabel + CRUD admin untuk `kb_articles` lengkap, tapi tidak ditemukan halaman
publik untuk Karyawan membaca artikel KB. `views` counter tidak pernah di-increment.

---

## 8. Ringkasan & Rekomendasi Prioritas

| # | Isu | Severity | Status | Rekomendasi singkat |
|---|---|---|---|---|
| 1 | Login tidak verifikasi password ([§5.1](#51-tidak-ada-verifikasi-password---celah-kritis)) | **Kritis** | ✅ **Fixed** | `login()` kini membandingkan password ke `app_users.default_password` (akun import) / `SEED_DEFAULT_PASSWORD` (akun bawaan). Lihat [§9](#9-changelog-perbaikan-13-juni-2026) |
| 2 | RLS terbuka penuh + anon key di client ([§5.4](#54-rls-terbuka--anon-key-di-client--akses-penuh-ke-db)) | **Kritis** | ✅ **Fixed (Auth)** | Migrasi ke Supabase Auth: anon ditolak, RLS authenticated/admin (v6). Lihat [§10](#10-migrasi-supabase-auth-13-juni-2026) |
| 3 | Impersonasi PIC via dropdown ([§5.2](#52-impersonasi-pic-via-dropdown)) | **Tinggi** | ✅ **Fixed** | `currentPicId` dikunci ke `session.picId`; dropdown "act-as" hanya untuk role `admin`. Lihat [§9](#9-changelog-perbaikan-13-juni-2026) |
| 4 | `default_password` plaintext tidak terpakai ([§5.5](#55-plaintext-password-di-app_usersdefault_password)) | **Tinggi** | ✅ **Fixed (Auth)** | Password asli kini di-hash & dikelola Supabase Auth (`auth.users`). `default_password` hanya jejak prototipe & tabel `app_users` tak lagi terbaca anon (RLS admin-only). Lihat [§10](#10-migrasi-supabase-auth-13-juni-2026) |
| 5 | jsonb full-array overwrite → lost update ([§6.3](#63-jsonb-full-array-overwrite--lost-update)) | **Tinggi** | ✅ **Fixed** | Append komentar/aktivitas kini atomik via Postgres function `append_ticket_event()` (RPC). Lihat [§9](#9-changelog-perbaikan-13-juni-2026) |
| 6 | Dua skema ID tiket berbeda, rawan kolisi ([§6.5](#65-dua-skema-id-tiket-yang-berbeda--rawan-kolisi)) | **Sedang** | — | Satukan jadi satu fungsi `generateTicketId()`, atau lebih baik gunakan `gen_random_uuid()`/sequence di DB |
| 7 | CSAT tidak pernah disimpan ([§7.1](#71-csat-rating-dikumpulkan-tapi-tidak-pernah-disimpan)) | **Sedang** | ✅ **Fixed** | Rating bintang kini disimpan via `updateTicketFields(id, { csat })` (handler `saveCsat` di dashboard); modal init dari `ticket.csat`; mengisi angka CSAT di #8 |
| 8 | Dashboard/Reporting admin berisi data fiktif ([§7.2](#72-dashboard--reporting-admin-berisi-data-fiktif)) | **Sedang** | ✅ **Fixed** | Angka dihitung dari data tiket nyata (volume 7 hari, SLA compliance, MoM, avg resolution, performa PIC per-orang). CSAT real setelah #7. Helper di `admin/page.tsx`; filter palsu Reporting dihapus |
| 9 | `deactivatePic` = hard delete ([§6.2](#62-deactivatepic--hard-delete-bukan-soft-delete)) | **Sedang** | — | Ubah jadi `update pics set is_active = false` sesuai nama fungsi & kolom yang sudah ada |
| 10 | `updateApp` tidak update `keywords`/`teamId` ([§6.1](#61-denormalisasi-tanpa-foreign-key-di-tickets)) | **Rendah** | — | Tambahkan kedua field ke payload `updateApp` |
| 11 | Polling 20s, bukan Realtime ([§6.6](#66-polling-bukan-realtime)) | **Rendah** | — | Pertimbangkan Supabase Realtime untuk tiket aktif, terutama yang sedang dibuka di modal |
| 12 | Notifikasi PIC tidak persisten ([§7.3](#73-notifikasi-pic-tidak-persisten)) | **Rendah** | — | Buat ulang tabel `notifications` ringan jika fitur ini penting |

---

## 9. Changelog Perbaikan (13 Juni 2026)

Eksekusi perbaikan severity **Kritis & Tinggi** yang aman dilakukan tanpa
merombak arsitektur auth (lihat catatan #2/#4 di bawah).

### ✅ #1 — Login sekarang memverifikasi password (`src/lib/auth.ts`)
- `login()` membandingkan password yang diinput:
  - Akun **import** (`app_users`) → dicocokkan ke `default_password`.
  - Akun **bawaan** (`SEED_ACCOUNTS`) → dicocokkan ke `SEED_DEFAULT_PASSWORD`
    (baru, di `src/lib/account-store.ts`), default **`ithelpdesk2026`**,
    bisa di-override via env `NEXT_PUBLIC_SEED_PASSWORD`, atau per-akun via
    field opsional `password`.
- Error yang dikembalikan tetap generic (tidak membocorkan email mana yang ada).
- **Catatan operasional**: 14 akun bawaan kini login dengan password
  `ithelpdesk2026` (atau nilai env-mu). Akun import login dengan
  `default_password` masing-masing (pola `IT@<nama>2026` atau yang di-set admin).

### ✅ #3 — Identitas PIC dikunci ke session (`src/app/pic/page.tsx`)
- `currentPicId` default dari `session.picId`; PIC biasa **tidak lagi** punya
  dropdown ganti-identitas (ditampilkan sebagai teks statis nama mereka).
- Dropdown "act-as" hanya muncul untuk role **`admin`** (untuk oversight),
  dengan default ke PIC pertama bila admin tak punya `picId`.

### ✅ #5 — Append komentar/aktivitas kini atomik
- DB: function baru **`append_ticket_event(p_id, p_comments, p_activity, p_status, p_resolved_at)`**
  di `supabase/schema.sql` — melakukan `comments || p_comments` &
  `activity || p_activity` dalam satu `UPDATE` ter-lock per-row.
- Client: helper baru **`appendTicketEvent()`** di `src/lib/ticket-store.ts`
  (via `supabase.rpc`). Dipakai oleh `addComment` di `dashboard` & `pic` —
  menggantikan pola read-modify-write yang rawan *lost update*.
- ⚠️ **Wajib dijalankan di Supabase**: function `append_ticket_event` harus
  dibuat di database sebelum fitur balasan berfungsi. Jalankan blok
  `create or replace function append_ticket_event(...)` dari `schema.sql`
  (aman, tidak menyentuh data tabel — **jangan** re-run seluruh `schema.sql`
  karena ada `drop table tickets cascade` di atasnya yang akan menghapus tiket).

### ✅ #2 (RLS terbuka) & #4 (plaintext password) — diselesaikan via migrasi Auth
Keduanya **coupled** dan ditutup bersama lewat migrasi ke **Supabase Auth**.
Detail lengkap + langkah manual ada di **[§10](#10-migrasi-supabase-auth-13-juni-2026)**.

> Verifikasi: `npx tsc --noEmit` lulus tanpa error setelah seluruh perubahan di atas.

---

## 10. Migrasi Supabase Auth (13 Juni 2026)

Menutup celah **#2** (RLS terbuka + anon key) dan **#4** (password plaintext)
sekaligus. Sumber kebenaran keamanan pindah ke **token Supabase + RLS**;
`itlk_session` di localStorage turun pangkat jadi *cache UI* untuk guard routing
(memalsukannya tidak memberi akses data — client tetap perlu JWT valid).

### Yang berubah (kode)
| File | Perubahan |
|---|---|
| `supabase/schema.sql` (v6) | Tabel `profiles` (identitas app per `auth.users.id`); helper `auth_role()`/`auth_is_admin()` (SECURITY DEFINER); **RLS diketatkan**: anon ditolak total, master-data/tickets/KB read = authenticated, write master/KB = admin, `app_users`+`profiles` = self/admin |
| `src/lib/supabase/client.ts` | Opsi auth eksplisit (`persistSession`, `autoRefreshToken`) |
| `src/lib/auth.ts` | `login()` → `signInWithPassword`; identitas (role/picId/name) dibaca dari `user_metadata`; `getSession()` tetap sinkron (baca cache); `logout()` + `signOut()`; helper `syncSession()` |
| `src/app/api/admin/users/route.ts` (baru) | Server route service-role untuk create/update/delete `auth.users` (POST/PATCH/DELETE), dengan verifikasi caller = admin. Akun bawaan (tanpa baris `app_users`) tetap diproteksi dari ubah-email/hapus |
| `src/lib/admin-accounts.ts` | `adminCreateAccount/Update/Delete` jadi wrapper `fetch` ke route di atas (kirim `Authorization: Bearer`) |
| `scripts/provision-auth.mjs` (baru) | Provisioning idempotent: buat `auth.users` + `profiles` untuk 14 seed account & semua baris `app_users` |
| `src/app/login/page.tsx` | Placeholder email `@lippo.id` → `@ithelpdesk.com` |
| `src/lib/email.ts` (baru) | `sendWelcomeEmail()` — kirim email kredensial akun baru via EmailJS |
| `src/lib/data.ts` + `src/types/index.ts` | `emailConfig.welcomeTemplateId` (`NEXT_PUBLIC_EMAILJS_WELCOME_TEMPLATE_ID`) |
| `src/app/admin/page.tsx` | Import CSV + Users (add PIC/User) kini benar-benar mengirim email kredensial (bukan simulasi); `email_sent` ditandai hanya bila email sungguh terkirim; fallback alert berisi password bila email gagal |

### Model RLS baru (ringkas)
- **anon** → ditolak semua tabel.
- **authenticated** → boleh baca master-data, tickets, KB.
- **admin** (`profiles.role='admin'`) → boleh tulis master-data & KB, baca/kelola `app_users` & `profiles`.
- **tickets** → tulis oleh semua authenticated (user buat, PIC update). *Catatan:* per-row ownership belum diterapkan (app masih fetch semua tiket lalu filter di client) — pengetatan lanjutan.
- **service role** (route + script) → bypass RLS untuk operasi `auth.users`.

### ⚠️ Langkah manual wajib (oleh kamu — butuh akses Supabase & network)
1. **Jalankan schema** di Supabase SQL editor.
   - DB dev/kosong: jalankan seluruh `supabase/schema.sql`.
   - **DB sudah berisi tiket**: JANGAN re-run penuh (ada `drop table tickets cascade`).
     Jalankan hanya blok: tabel `profiles`, function `auth_role`/`auth_is_admin`,
     seluruh blok RLS v6, dan function `append_ticket_event`.
2. **Set env** (`.env.local`): `SUPABASE_SERVICE_ROLE_KEY=...` (server-only, **bukan** `NEXT_PUBLIC_`).
   Pastikan `NEXT_PUBLIC_SUPABASE_URL` & `NEXT_PUBLIC_SUPABASE_ANON_KEY` sudah ada.
   Untuk email kredensial akun baru: `NEXT_PUBLIC_EMAILJS_ENABLED=true` +
   `NEXT_PUBLIC_EMAILJS_WELCOME_TEMPLATE_ID=<template_id>` (buat template EmailJS baru
   dengan variabel `{{to_email}} {{to_name}} {{login_email}} {{login_password}} {{role}} {{login_url}}`).
3. **Provision akun**: `node scripts/provision-auth.mjs`
   - 14 akun bawaan → password `ithelpdesk2026` (atau `NEXT_PUBLIC_SEED_PASSWORD`).
   - Baris `app_users` lama → password = `default_password` masing-masing.
4. **Tes** (`npm run dev`): login admin/PIC/user; pastikan data tampil & reply tersimpan;
   coba REST anon tanpa login → harus ditolak/kosong; buat akun via Admin → bisa login.

### Catatan
- Tidak bisa aku tes runtime (sandbox tanpa network) — verifikasi end-to-end di tangan kamu.
- `scripts/provision-auth.mjs` menyalin daftar seed account dari `src/lib/account-store.ts`
  secara manual (file `.mjs` tak bisa import modul TS) — jaga keduanya tetap sinkron jika daftar berubah.

*Dokumen ini adalah snapshot analisis kode per 13 Juni 2026. Karena migrasi
Supabase masih berjalan (hybrid, belum di-commit), beberapa detail di atas dapat
berubah pada commit berikutnya.*
