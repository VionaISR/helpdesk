import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import type { User } from '@supabase/supabase-js';

async function requireAdmin(req: NextRequest): Promise<User | null> {
  const authHeader = req.headers.get('authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) return null;

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return null;

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', data.user.id)
    .single();

  if (!profile || profile.role !== 'admin') return null;
  return data.user;
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin(req))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const { email, password, name, role, picId, teamId, dept, initials } = body as {
    email: string; password: string; name: string; role: 'pic' | 'user';
    picId?: string; teamId?: string; dept?: string; initials?: string;
  };

  if (!email || !password || !name || !role) {
    return NextResponse.json({ error: 'Data tidak lengkap.' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    user_metadata: { name, role, pic_id: picId, team_id: teamId, dept, initials },
  });

  if (error) {
    const msg = error.message.toLowerCase().includes('already been registered')
      ? 'Email sudah terdaftar di Supabase Auth.'
      : error.message;
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  return NextResponse.json({ ok: true, userId: data.user?.id });
}

export async function PATCH(req: NextRequest) {
  if (!(await requireAdmin(req))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const { email, newEmail, newPassword, name } = body as {
    email: string; newEmail?: string; newPassword?: string; name?: string;
  };

  const { data: profile, error: findError } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('email', email)
    .single();
  if (findError || !profile) {
    return NextResponse.json({ error: 'Akun tidak ditemukan.' }, { status: 404 });
  }

  const { data: authUser, error: getError } = await supabaseAdmin.auth.admin.getUserById(profile.id);
  if (getError || !authUser.user) {
    return NextResponse.json({ error: 'Akun tidak ditemukan di Supabase Auth.' }, { status: 404 });
  }

  const updates: Parameters<typeof supabaseAdmin.auth.admin.updateUserById>[1] = {};
  if (newPassword) updates.password = newPassword;
  if (newEmail && newEmail !== email) updates.email = newEmail;
  if (name) updates.user_metadata = { ...authUser.user.user_metadata, name };

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ ok: true });
  }

  const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(profile.id, updates);
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  if (!(await requireAdmin(req))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const { email } = body as { email: string };

  const { data: profile, error: findError } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('email', email)
    .single();
  if (findError || !profile) {
    return NextResponse.json({ error: 'Akun tidak ditemukan.' }, { status: 404 });
  }

  const { error } = await supabaseAdmin.auth.admin.deleteUser(profile.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
