import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Server-only route for operations that touch auth.users (create / update /
// delete a login). These require the service-role key, which must NEVER be
// exposed to the browser — hence this route handler. The caller's JWT is
// verified to be an admin before anything happens.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

function adminClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function err(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

// Verify the request comes from a logged-in admin. Returns the service client
// on success so handlers can reuse it.
async function requireAdmin(
  req: NextRequest,
): Promise<{ ok: true; sb: SupabaseClient } | { ok: false; res: NextResponse }> {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return { ok: false, res: err(500, 'Server belum dikonfigurasi (SUPABASE_SERVICE_ROLE_KEY).') };
  }
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return { ok: false, res: err(401, 'Tidak terotorisasi.') };

  const sb = adminClient();
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data.user) return { ok: false, res: err(401, 'Sesi tidak valid.') };

  const { data: prof } = await sb.from('profiles').select('role').eq('id', data.user.id).maybeSingle();
  if (prof?.role !== 'admin') return { ok: false, res: err(403, 'Hanya admin yang boleh mengelola akun.') };

  return { ok: true, sb };
}

function randomId(): string {
  return `u-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

// ─── CREATE ─────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;
  const sb = auth.sb;

  const body = await req.json().catch(() => ({}));
  const email: string = (body.email ?? '').toLowerCase().trim();
  const password: string = body.password ?? '';
  const name: string = body.name ?? '';
  const role: string = body.role ?? 'user';
  const picId: string | null = body.picId ?? null;
  const teamId: string | null = body.teamId ?? null;
  const dept: string | null = body.dept ?? null;

  if (!email || !password || !name) return err(400, 'Email, nama, dan password wajib diisi.');
  if (!['user', 'pic'].includes(role)) return err(400, 'Role tidak valid.');

  const { data: existing } = await sb.from('profiles').select('id').ilike('email', email).maybeSingle();
  if (existing) return err(409, 'Email sudah terdaftar.');

  const { data: created, error: createErr } = await sb.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { role, name, pic_id: picId, dept, team_id: teamId },
  });
  if (createErr || !created.user) {
    return err(400, createErr?.message ?? 'Gagal membuat akun.');
  }

  const userId = created.user.id;
  const { error: profErr } = await sb.from('profiles').insert({
    id: userId, email, name, role, pic_id: picId, dept, team_id: teamId,
  });
  if (profErr) {
    // Roll back the auth user so we don't leave an orphan.
    await sb.auth.admin.deleteUser(userId);
    return err(500, 'Gagal menyimpan profil: ' + profErr.message);
  }

  await sb.from('app_users').insert({
    id: randomId(),
    email,
    name,
    dept,
    role,
    team_id: teamId,
    default_password: password,
    registered_at: new Date().toISOString(),
    email_sent: false,
  });

  return NextResponse.json({ ok: true });
}

// ─── UPDATE ─────────────────────────────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;
  const sb = auth.sb;

  const body = await req.json().catch(() => ({}));
  const email: string = (body.email ?? '').toLowerCase().trim();
  const newEmail: string | undefined = body.newEmail?.toLowerCase().trim();
  const newPassword: string | undefined = body.newPassword;
  const name: string | undefined = body.name;
  if (!email) return err(400, 'Email wajib diisi.');

  const { data: prof } = await sb.from('profiles').select('id, role').ilike('email', email).maybeSingle();
  if (!prof) return err(404, 'Akun tidak ditemukan.');

  // Seed accounts (built-in) have a profile but no app_users row — protect them.
  const { data: appUser } = await sb.from('app_users').select('id').ilike('email', email).maybeSingle();
  const isSeed = !appUser;
  if (isSeed && newEmail && newEmail !== email) {
    return err(400, 'Email login akun bawaan sistem tidak bisa diubah.');
  }

  const metaPatch: Record<string, unknown> = {};
  if (name !== undefined) metaPatch.name = name;
  const authPatch: Parameters<typeof sb.auth.admin.updateUserById>[1] = {};
  if (newEmail) authPatch.email = newEmail;
  if (newPassword) authPatch.password = newPassword;
  if (Object.keys(metaPatch).length > 0) authPatch.user_metadata = metaPatch;

  if (Object.keys(authPatch).length > 0) {
    const { error } = await sb.auth.admin.updateUserById(prof.id, authPatch);
    if (error) return err(400, error.message);
  }

  const profilePatch: Record<string, unknown> = {};
  if (name !== undefined) profilePatch.name = name;
  if (newEmail) profilePatch.email = newEmail;
  if (Object.keys(profilePatch).length > 0) {
    await sb.from('profiles').update(profilePatch).eq('id', prof.id);
  }

  if (appUser) {
    const appPatch: Record<string, unknown> = {};
    if (name !== undefined) appPatch.name = name;
    if (newEmail) appPatch.email = newEmail;
    if (newPassword) appPatch.default_password = newPassword;
    if (Object.keys(appPatch).length > 0) {
      await sb.from('app_users').update(appPatch).eq('id', appUser.id);
    }
  }

  return NextResponse.json({ ok: true });
}

// ─── DELETE ─────────────────────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;
  const sb = auth.sb;

  const body = await req.json().catch(() => ({}));
  const email: string = (body.email ?? '').toLowerCase().trim();
  if (!email) return err(400, 'Email wajib diisi.');

  const { data: prof } = await sb.from('profiles').select('id').ilike('email', email).maybeSingle();
  if (!prof) return err(404, 'Akun tidak ditemukan.');

  const { data: appUser } = await sb.from('app_users').select('id').ilike('email', email).maybeSingle();
  if (!appUser) return err(400, 'Akun bawaan sistem tidak bisa dihapus.');

  // Deleting the auth user cascades to profiles (FK on delete cascade).
  const { error } = await sb.auth.admin.deleteUser(prof.id);
  if (error) return err(400, error.message);
  await sb.from('app_users').delete().eq('id', appUser.id);

  return NextResponse.json({ ok: true });
}
