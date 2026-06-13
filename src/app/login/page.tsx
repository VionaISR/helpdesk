'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { login, getSession, getRedirectUrl } from '@/lib/auth';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  useEffect(() => {
    const session = getSession();
    if (session) router.replace(getRedirectUrl(session.role));
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email.trim()) { setError('Masukkan email perusahaan kamu.'); return; }
    if (!password.trim()) { setError('Masukkan password.'); return; }
    setLoading(true);
    const result = await login(email, password);
    if (!result.ok) { setError(result.error); setLoading(false); return; }
    router.replace(getRedirectUrl(result.session.role));
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">🛠</div>
        <div className="login-title">IT Helpdesk</div>
        <div className="login-subtitle">Masuk dengan akun yang telah didaftarkan oleh admin IT.</div>

        <form className="login-form" onSubmit={handleSubmit}>
          {error && <div className="login-error">{error}</div>}
          <div className="field">
            <label className="label">Email</label>
            <input
              className="input"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="nama@ithelpdesk.com"
              autoComplete="email"
            />
          </div>
          <div className="field">
            <label className="label">Password</label>
            <input
              className="input"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Masukkan password"
              autoComplete="current-password"
            />
          </div>
          <button
            className="btn btn-primary"
            type="submit"
            style={{ width: '100%', marginTop: 4 }}
            disabled={loading}
          >
            {loading ? 'Loading...' : 'Masuk'}
          </button>
        </form>
      </div>
    </div>
  );
}
