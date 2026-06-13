# Progress Report — IT Helpdesk

> Snapshot: 2026-06-13
> Branch: `master` — working tree punya perubahan **uncommitted** (lihat §3).
> Commit terakhir: `e2e59f8` (feat: ganti domain email seed accounts ke @ithelpdesk.com)

Tujuan dokumen ini: checkpoint tertulis supaya kalau ada error/regresi di
langkah berikutnya, kita tahu persis fitur apa yang sudah jalan & file mana
yang berubah di titik ini — dan bisa dibandingkan/di-restore lewat git diff
dari sini.

---

## 1. Status vs PRODUCT_SPEC.md (per fase §14)

### Phase 1 — Core Flow: ✅ jalan, dengan simplifikasi
- Auto-routing app → team/PIC ✅, SLA calc & display ✅
- Timeline ✅ tapi sebagai `activity[]` embedded di tiket (bukan tabel
  `ticket_timeline` terpisah seperti §7.1)
- ❌ "Queued" status / multi-PIC array + claim-race (§3.3–3.4) **belum
  ada** — routing masih single-PIC auto-assign, `TicketStatus` tidak punya
  `Queued`
- ⚠️ "Specific Task" masih tampil di form submit user — §FR-1.4 minta ini
  internal-only. Kemungkinan simplifikasi sengaja, perlu konfirmasi.

### Phase 2 — PIC Workflow: ✅ jalan
- Accept/claim (single PIC), update status, komentar publik + internal note
- 🆕 User sekarang bisa **reply ke PIC** dari tiket (fitur baru sesi ini)
- 🆕 Attachment upload (image/PDF, 5MB) + preview di kedua sisi

### Phase 3 — Admin & Reporting: ✅ paling matang
- Routing Rules CRUD, SLA config, Categories config, KB Manager,
  Reporting + Weekly Report, Import User CSV, Users page, Cutoff page,
  Aplikasi page — semua ada di `src/app/admin/page.tsx`

### Phase 4 — Notifications & Polish: ⚠️ partial
- Email pakai EmailJS (spec §13 minta Resend)
- Notifikasi PIC: in-memory saat mount saja, tidak persist, tidak ada
  read/unread cross-session
- Tidak ada realtime sync / SLA breach cron
- CSAT rating di modal user (`setRating`) **tidak tersimpan** ke
  `ticket.csat` — UI saja, hilang begitu modal ditutup, tidak masuk laporan

---

## 2. ⚠️ Blocker utama untuk testing multi-device

Tiket, komentar, dan auth (`ticketStore`, `itlk_session`) masih
**localStorage per-browser** (§10: "menyusul di fase berikutnya"). Artinya:
- Tiket dari user di komputer A **tidak muncul** untuk PIC di komputer B.
- Komunikasi user↔PIC yang sudah ditest tadi kemungkinan jalan karena dites
  di tab/browser yang sama.
- Login terima password apapun asal email cocok — oke untuk pilot internal,
  bukan auth real.

Master data (teams/pics/categories/app_routing/sla_rules/kb_articles) sudah
di Supabase (hybrid migration, lihat §3), tapi tiket/komentar belum.

---

## 3. Working Tree Snapshot (uncommitted, per 2026-06-13)

```
 .claude/settings.local.json |   4 +-
 PRODUCT_SPEC.md             |  13 +-
 package-lock.json           |  94 +++++++++++
 package.json                |   1 +
 src/app/admin/page.tsx      |  20 ---  (hapus NavLink/nav duplikat)
 src/app/dashboard/page.tsx  | 112 +++++++++++-  (attachments + reply box user)
 src/app/globals.css         |   2 -  (hapus .sw-btn-tool, unused)
 src/app/pic/page.tsx         |  24 +-  (attachment preview, hapus toolbar B/I/📎)
 src/lib/master-data.ts       | 289 ++++++++++--  (rewrite ke Supabase, master data only)
 src/types/index.ts           |   9 +-  (tambah Attachment interface)
 supabase/schema.sql          | 198 +++++--  (categories table, kolom baru, RLS anon)
 supabase/seed.sql            |  74 +++--  (regenerate dari src/lib/data.ts)
 tsconfig.tsbuildinfo          |   2 +-
```

Untracked baru:
- `src/lib/supabase/client.ts` — browser Supabase client (pakai
  `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` dari `.env.local`)
- `.pwtest/revert-*.png`, `.pwtest/revert-login-check.js` — sisa verifikasi
  revert 2026-06-12, tidak terkait kerja ini

`npx tsc --noEmit` lolos bersih per snapshot ini.

### Ringkasan perubahan fungsional di sesi ini
1. **Hybrid Supabase migration (Phase 2)** — master data baca/tulis Supabase,
   tickets/comments/auth tetap localStorage. Perlu `supabase/schema.sql` +
   `supabase/seed.sql` dijalankan di project Supabase (cek apakah sudah).
2. **Ticket attachments** — upload gambar/PDF saat submit tiket, preview di
   dashboard user & detail tiket PIC.
3. **Komunikasi dua arah user↔PIC** — user bisa reply tiket lewat
   `TicketDetailModal`, balasan masuk ke `ticket.comments` (`isInternal:
   false`) + `activity[]`, langsung kebaca PIC.
4. **Cleanup** — hapus `NavLink`/`<nav>` duplikat di admin page, hapus tombol
   B/I/📎 yang tidak berfungsi di kotak komentar PIC + CSS-nya.

### Cara rollback ke titik ini
- Belum ada commit untuk perubahan di atas → kalau ingin checkpoint git yang
  bisa di-`reset`/`checkout`, perlu commit manual (belum dilakukan, sesuai
  instruksi: commit hanya saat diminta eksplisit).
- Untuk sekarang, `git diff` dari commit `e2e59f8` = state lengkap di titik
  ini; `git stash` bisa dipakai untuk parkir sementara kalau perlu eksperimen.

---

## 4. Open Items / Kandidat Tahap Selanjutnya

- Lanjut migrasi `ticketStore` (tickets/comments/timeline) + auth ke
  Supabase — ini yang membuka testing multi-device.
- Persist CSAT rating ke `ticket.csat`.
- Implementasi multi-PIC queue/claim (§3.3–3.4) — kalau memang masih jadi
  requirement.
- Jalankan `supabase/schema.sql` + `supabase/seed.sql` ke project Supabase
  live (prasyarat sebelum master-data CRUD benar-benar dipakai).
