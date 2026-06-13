'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import emailjs from '@emailjs/browser';
import { getSession, logout } from '@/lib/auth';
import { useTickets, insertTicket, appendTicketEvent, updateTicketFields } from '@/lib/ticket-store';
import { emailConfig, specificTasks } from '@/lib/data';
import { useMasterData } from '@/lib/master-data';
import { formatDate, formatDateTime, timeAgo, statusClass, generateTicketId, openAttachment, downloadAttachment } from '@/lib/utils';
import type { Ticket, Session, PIC, Team, App, SlaRule, KBArticle, Attachment, Comment, ActivityItem } from '@/types';

const MAX_ATTACHMENT_SIZE = 5 * 1024 * 1024; // 5MB

// ─── NAV LINK COMPONENT ───────────────────────────────────────────────────────
function NavLink({ icon, label, active, onClick }: { icon: string; label: string; active?: boolean; onClick: () => void }) {
  return (
    <div className={`sw-nav-link${active?' active':''}`} onClick={onClick}>
      <span className="nav-icon">{icon}</span>
      <span>{label}</span>
    </div>
  );
}

// ─── TOAST ────────────────────────────────────────────────────────────────────
function Toast({ toast }: { toast: { msg: string; type: string } }) {
  const colors: Record<string, string> = { success: '#4CAF50', warn: '#FF9800', error: '#F44336' };
  const icons: Record<string, string>  = { success: '✓', warn: '⚠', error: '✕' };
  return (
    <div style={{ position:'fixed', bottom:24, right:24, zIndex:9999, background: colors[toast.type] || colors.success, color:'#fff', padding:'12px 18px', borderRadius:10, boxShadow:'0 4px 20px rgba(0,0,0,0.2)', fontSize:13, fontWeight:500, maxWidth:380, display:'flex', alignItems:'flex-start', gap:10, lineHeight:1.5 }}>
      <span style={{ fontWeight:700, flexShrink:0 }}>{icons[toast.type] || '✓'}</span>
      <span>{toast.msg}</span>
    </div>
  );
}

// ─── SUBMIT MODAL ─────────────────────────────────────────────────────────────
function SubmitModal({ session, allPics, allTeams, allApps, allSlaRules, onClose, onSubmit }: { session: Session; allPics: PIC[]; allTeams: Team[]; allApps: App[]; allSlaRules: SlaRule[]; onClose: () => void; onSubmit: (t: Ticket) => void }) {
  const [form, setForm] = useState({ subject: '', body: '', appName: '', specificTask: '' });
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [fileError, setFileError] = useState('');
  const [appSearch, setAppSearch] = useState('');
  const [appOpen, setAppOpen] = useState(false);
  const appRef = React.useRef<HTMLDivElement>(null);
  const [taskSearch, setTaskSearch] = useState('');
  const [taskOpen, setTaskOpen] = useState(false);
  const taskRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (appRef.current && !appRef.current.contains(e.target as Node)) setAppOpen(false);
      if (taskRef.current && !taskRef.current.contains(e.target as Node)) setTaskOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selectedApp = allApps.find(a => a.name === form.appName);
  const categoryId = selectedApp ? selectedApp.prefix : '';

  const assignedPic = selectedApp?.picId ? allPics.find(p => p.id === selectedApp.picId) : null;
  const assignedTeam = assignedPic ? assignedPic.teamId : null;

  const isValid = form.subject && form.appName && form.body;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    setFileError('');
    files.forEach(file => {
      if (file.size > MAX_ATTACHMENT_SIZE) {
        setFileError(`${file.name} melebihi 5MB, tidak diupload.`);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        setAttachments(prev => [...prev, { name: file.name, type: file.type, size: file.size, dataUrl: reader.result as string }]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const removeAttachment = (idx: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== idx));
  };

  const submit = async () => {
    if (!isValid) return;
    const now = new Date().toISOString();
    const ticket: Ticket = {
      id: generateTicketId(),
      subject: form.subject,
      from: session.email,
      fromName: session.name,
      dept: 'Karyawan',
      body: form.body,
      category: categoryId,
      app: form.appName,
      specificTask: form.specificTask,
      priority: 'Medium',
      assigneeTeamId: assignedTeam,
      assignedToId: assignedPic?.id ?? null,
      assignedName: assignedPic?.name ?? 'Unassigned',
      status: 'Open',
      autoRouted: false,
      createdAt: now,
      updatedAt: now,
      slaDeadline: new Date(Date.now() + (allSlaRules.find(s => s.priority === 'Medium')?.targetHours ?? 24) * 3600 * 1000).toISOString(),
      comments: [],
      attachments,
      activity: [{ type: 'system', time: now, text: `Tiket dibuat. PIC auto-assign: ${assignedPic?.name ?? 'Unassigned'} (dari routing rules)` }],
      isNew: true,
    };
    await insertTicket(ticket);
    onSubmit(ticket);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">📝 Buat Tiket Baru</div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="field">
            <label className="label">Subject *</label>
            <input className="input" value={form.subject} onChange={e => setForm(p => ({ ...p, subject: e.target.value }))} placeholder="Ringkasan masalah singkat" />
          </div>

          <div className="field" ref={appRef} style={{ position: 'relative' }}>
            <label className="label">Nama Aplikasi *</label>
            <input
              className="input"
              placeholder="Ketik untuk cari aplikasi..."
              value={appOpen ? appSearch : form.appName}
              onFocus={() => { setAppOpen(true); setAppSearch(''); }}
              onChange={e => { setAppSearch(e.target.value); setAppOpen(true); }}
              autoComplete="off"
            />
            {appOpen && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', maxHeight: 220, overflowY: 'auto', marginTop: 4 }}>
                {allApps
                  .filter(a => !appSearch || a.name.toLowerCase().includes(appSearch.toLowerCase()))
                  .map(a => (
                    <div
                      key={a.name}
                      onMouseDown={() => { setForm(p => ({ ...p, appName: a.name })); setAppOpen(false); setAppSearch(''); }}
                      style={{ padding: '9px 14px', fontSize: 13, cursor: 'pointer', background: form.appName === a.name ? 'var(--surface-2)' : 'transparent', borderBottom: '1px solid var(--border)' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                      onMouseLeave={e => (e.currentTarget.style.background = form.appName === a.name ? 'var(--surface-2)' : 'transparent')}
                    >
                      <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text-muted)', marginRight: 8, padding: '1px 5px', background: 'var(--surface-2)', borderRadius: 3 }}>{a.prefix}</span>
                      {a.name}
                    </div>
                  ))}
                {allApps.filter(a => !appSearch || a.name.toLowerCase().includes(appSearch.toLowerCase())).length === 0 && (
                  <div style={{ padding: '12px 14px', fontSize: 13, color: 'var(--text-muted)' }}>Tidak ada aplikasi ditemukan</div>
                )}
              </div>
            )}
            {categoryId && !appOpen && <div className="field-hint">Kategori: {categoryId}</div>}
          </div>

          {form.appName && (
            <div style={{ marginBottom: 16, padding: 14, borderRadius: 10, border: `1px solid ${assignedPic ? 'var(--status-done)' : 'var(--border)'}`, background: assignedPic ? 'var(--status-done-bg)' : 'var(--surface-2)' }}>
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 8 }}>PIC yang akan menangani</div>
              {assignedPic ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div className="user-avatar" style={{ width: 28, height: 28, fontSize: 11 }}>{assignedPic.initials}</div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--status-done)' }}>{assignedPic.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{allTeams.find(t => t.id === assignedPic.teamId)?.name}</div>
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  ⚠ Belum ada PIC untuk aplikasi ini. Tiket masuk sebagai <strong>Unassigned</strong>.
                </div>
              )}
            </div>
          )}

          <div className="field" ref={taskRef} style={{ position: 'relative' }}>
            <label className="label">Specific Task</label>
            <input
              className="input"
              placeholder="Ketik untuk cari task..."
              value={taskOpen ? taskSearch : form.specificTask}
              onFocus={() => { setTaskOpen(true); setTaskSearch(''); }}
              onChange={e => { setTaskSearch(e.target.value); setTaskOpen(true); }}
              autoComplete="off"
            />
            {taskOpen && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', maxHeight: 200, overflowY: 'auto', marginTop: 4 }}>
                {specificTasks
                  .filter(t => !taskSearch || t.name.toLowerCase().includes(taskSearch.toLowerCase()))
                  .map(t => (
                    <div
                      key={t.name}
                      onMouseDown={() => { setForm(p => ({ ...p, specificTask: t.name })); setTaskOpen(false); setTaskSearch(''); }}
                      style={{ padding: '9px 14px', fontSize: 13, cursor: 'pointer', background: form.specificTask === t.name ? 'var(--surface-2)' : 'transparent', borderBottom: '1px solid var(--border)' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                      onMouseLeave={e => (e.currentTarget.style.background = form.specificTask === t.name ? 'var(--surface-2)' : 'transparent')}
                    >
                      {t.name}
                    </div>
                  ))}
                {specificTasks.filter(t => !taskSearch || t.name.toLowerCase().includes(taskSearch.toLowerCase())).length === 0 && (
                  <div style={{ padding: '12px 14px', fontSize: 13, color: 'var(--text-muted)' }}>Tidak ada task ditemukan</div>
                )}
              </div>
            )}
          </div>

          <div className="field">
            <label className="label">Deskripsi Masalah *</label>
            <textarea className="textarea" value={form.body} onChange={e => setForm(p => ({ ...p, body: e.target.value }))} placeholder="Jelaskan masalahnya sedetail mungkin..." style={{ minHeight: 120 }} />
            <div className="field-hint">Sertakan error message kalau ada, dan apa yang sudah dicoba</div>
          </div>
          <div className="field">
            <label className="label">Lampiran (opsional)</label>
            <input type="file" className="input" style={{ padding: '8px 12px' }} multiple accept="image/*,.pdf" onChange={handleFileChange} />
            <div className="field-hint">Screenshot atau file pendukung (gambar/PDF). Max 5MB per file.</div>
            {fileError && <div className="field-hint" style={{ color: '#dc2626' }}>{fileError}</div>}
            {attachments.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                {attachments.map((a, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, background: 'var(--surface-2)', padding: '6px 10px', borderRadius: 6 }}>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📎 {a.name}</span>
                    <span style={{ color: 'var(--text-muted)' }}>{(a.size / 1024).toFixed(0)} KB</span>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeAttachment(i)}>✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Batal</button>
          <button className="btn btn-primary" onClick={submit} disabled={!isValid}>✓ Kirim Tiket</button>
        </div>
      </div>
    </div>
  );
}

// ─── TICKET DETAIL MODAL ──────────────────────────────────────────────────────
function TicketDetailModal({ ticket, session, onAddComment, onRate, onClose }: { ticket: Ticket; session: Session; onAddComment: (id: string, comment: Omit<Comment, 'isInternal'>) => void; onRate: (id: string, rating: number) => void; onClose: () => void }) {
  const [rating, setRating] = useState(ticket.csat ?? 0);
  const [reply, setReply] = useState('');
  const isDone   = ticket.status === 'Done';
  const isClosed = ticket.status === 'Closed';

  const submitReply = () => {
    if (!reply.trim()) return;
    onAddComment(ticket.id, {
      id: 'c' + Date.now(),
      authorId: session.email,
      authorName: session.name,
      authorInitials: session.initials,
      time: new Date().toISOString(),
      body: reply.trim(),
    });
    setReply('');
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth:680 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="modal-title">{ticket.subject}</div>
            <div className="mono" style={{ color:'var(--text-muted)', marginTop:4 }}>{ticket.id}</div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div style={{ display:'flex', gap:10, marginBottom:16, flexWrap:'wrap' }}>
            <span className={`badge ${statusClass(ticket.status)}`}><span className="badge-dot"></span>{ticket.status}</span>
            <span className={`priority priority-${ticket.priority.toLowerCase()}`}><span className="priority-bar"></span>{ticket.priority}</span>
            <span style={{ fontSize:12, color:'var(--text-muted)' }}>· {ticket.category}</span>
            <span style={{ fontSize:12, color:'var(--text-muted)' }}>· {ticket.assignedName}</span>
          </div>
          <div style={{ background:'var(--surface-2)', padding:16, borderRadius:10, marginBottom:16, fontSize:13, lineHeight:1.6, borderLeft: '4px solid var(--accent)' }}>
            {ticket.body}
          </div>
          {ticket.attachments.length > 0 && (
            <div style={{ marginBottom:16 }}>
              <div style={{ fontWeight:600, fontSize:13, marginBottom:10 }}>Lampiran</div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:10 }}>
                {ticket.attachments.map((a, i) => (
                  a.type.startsWith('image/') ? (
                    <button key={i} type="button" onClick={() => openAttachment(a)} title={`Buka ${a.name}`} style={{ padding:0, border:'none', background:'none', cursor:'pointer' }}>
                      <img src={a.dataUrl} alt={a.name} style={{ width:90, height:90, objectFit:'cover', borderRadius:8, border:'1px solid var(--border)' }} />
                    </button>
                  ) : (
                    <button key={i} type="button" onClick={() => downloadAttachment(a)} title={`Unduh ${a.name}`} style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 14px', background:'var(--surface-2)', border:'none', borderRadius:8, fontSize:12, cursor:'pointer', color:'var(--text)' }}>
                      📄 {a.name}
                    </button>
                  )
                ))}
              </div>
            </div>
          )}
          <div style={{ fontWeight:600, fontSize:13, marginBottom:10 }}>Aktivitas</div>
          {ticket.comments.filter(c => !c.isInternal).length > 0 ? ticket.comments.filter(c => !c.isInternal).map(c => (
            <div key={c.id} className="comment">
              <div className="comment-head">
                <div className="comment-avatar">{c.authorInitials}</div>
                <div><div className="comment-name">{c.authorName}{c.authorId === session.email ? ' (Anda)' : ''}</div><div className="comment-time">{formatDateTime(c.time)}</div></div>
              </div>
              <div className="comment-body">{c.body}</div>
            </div>
          )) : (
            <div style={{ fontSize:13, color:'var(--text-muted)', padding:'12px 0' }}>Belum ada balasan dari tim IT</div>
          )}
          {!isClosed && (
            <div style={{ marginTop:16 }}>
              <textarea
                className="textarea"
                placeholder="Tulis balasan ke tim IT..."
                value={reply}
                onChange={e => setReply(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) submitReply(); }}
                style={{ minHeight: 80 }}
              />
              <div style={{ display:'flex', justifyContent:'flex-end', marginTop:8 }}>
                <button className="btn btn-primary btn-sm" onClick={submitReply} disabled={!reply.trim()}>Kirim Balasan</button>
              </div>
            </div>
          )}
          {(isDone || isClosed) && (
            <div style={{ marginTop:20, padding:16, border:'1px solid var(--status-done)', borderRadius:10, background:'var(--status-done-bg)' }}>
              <div style={{ fontWeight:600, fontSize:13, color:'var(--status-done)', marginBottom:6 }}>Tiket sudah selesai</div>
              <div style={{ fontSize:12, color:'var(--text-muted)', marginBottom:12 }}>Bagaimana penanganannya?</div>
              <div style={{ display:'flex', gap:8 }}>
                {[1,2,3,4,5].map(n => (
                  <button key={n} className={`btn btn-sm ${rating >= n ? 'btn-primary' : 'btn-secondary'}`} style={{ minWidth:40 }} onClick={() => { setRating(n); onRate(ticket.id, n); }}>{n}★</button>
                ))}
              </div>
              {rating > 0 && <div style={{ fontSize:12, color:'var(--status-done)', marginTop:10 }}>Terima kasih atas penilaianmu! Rating tersimpan.</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── HOME PAGE ────────────────────────────────────────────────────────────────
function HomePage({ stats, tickets, onTicketClick, onNewTicket }: {
  stats: { open: number; done: number; total: number };
  tickets: Ticket[];
  onTicketClick: (t: Ticket) => void;
  onNewTicket: () => void;
}) {
  const recent = tickets.slice(0, 3);
  return (
    <div>
      <div className="stat-grid">
        <div className="stat"><div className="stat-label">Tiket aktif</div><div className="stat-value">{stats.open}</div><div className="stat-trend">Sedang dikerjakan tim IT</div></div>
        <div className="stat"><div className="stat-label">Selesai</div><div className="stat-value">{stats.done}</div><div className="stat-trend">Dalam 30 hari terakhir</div></div>
        <div className="stat"><div className="stat-label">Total tiket</div><div className="stat-value">{stats.total}</div><div className="stat-trend">Sepanjang waktu</div></div>
      </div>
      <div className="card" style={{ marginBottom:16 }}>
        <div className="card-header" style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div><div className="card-title">Tiket Terbaru</div><div className="card-subtitle">3 tiket terakhir yang Anda buat</div></div>
        </div>
        {recent.length > 0 ? (
          <table className="table">
            <thead><tr><th>ID Tiket</th><th>Subject</th><th>Status</th><th>Dibuat</th></tr></thead>
            <tbody>
              {recent.map(t => (
                <tr key={t.id} onClick={() => onTicketClick(t)}>
                  <td className="mono" style={{ fontSize:11, color:'var(--text-muted)' }}>{t.id}</td>
                  <td style={{ fontWeight:500 }}>{t.subject}</td>
                  <td><span className={`badge ${statusClass(t.status)}`}><span className="badge-dot"></span>{t.status}</span></td>
                  <td style={{ color:'var(--text-muted)', fontSize:12 }}>{timeAgo(t.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty"><div className="empty-title">Belum ada tiket</div><div className="empty-sub">Buat tiket baru kalau ada masalah IT</div></div>
        )}
      </div>
      <div className="card">
        <div className="card-body">
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div>
              <div style={{ fontWeight:600, marginBottom:4 }}>Sebelum buat tiket baru</div>
              <div style={{ fontSize:13, color:'var(--text-muted)' }}>Cek dulu di Knowledge Base, mungkin masalahnya sudah ada solusinya.</div>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={onNewTicket}>+ Buat Tiket</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── TICKETS PAGE ─────────────────────────────────────────────────────────────
function TicketsPage({ tickets, onTicketClick }: { tickets: Ticket[]; onTicketClick: (t: Ticket) => void }) {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const filtered = tickets
    .filter(t => {
      if (filter === 'active') return ['Open','In Progress','Pending','Revisi'].includes(t.status);
      if (filter === 'done') return ['Done','Closed'].includes(t.status);
      return true;
    })
    .filter(t => !search || t.subject.toLowerCase().includes(search.toLowerCase()) || t.id.toLowerCase().includes(search.toLowerCase()));

  return (
    <div>
      <div className="filters">
        <input className="filter-input" placeholder="Cari berdasarkan ID atau subject..." value={search} onChange={e => setSearch(e.target.value)} />
        <select className="filter-select" value={filter} onChange={e => setFilter(e.target.value)}>
          <option value="all">Semua status</option>
          <option value="active">Aktif</option>
          <option value="done">Selesai</option>
        </select>
      </div>
      <div className="card">
        <table className="table">
          <thead><tr><th>ID</th><th>Subject</th><th>Kategori</th><th>Status</th><th>Assigned</th><th>Dibuat</th></tr></thead>
          <tbody>
            {filtered.map(t => (
              <tr key={t.id} onClick={() => onTicketClick(t)}>
                <td className="mono" style={{ fontSize:11, color:'var(--text-muted)' }}>{t.id}</td>
                <td style={{ fontWeight:500 }}>{t.subject}</td>
                <td style={{ fontSize:12, color:'var(--text-muted)' }}>{t.category}</td>
                <td><span className={`badge ${statusClass(t.status)}`}><span className="badge-dot"></span>{t.status}</span></td>
                <td style={{ fontSize:12 }}>{t.assignedName}</td>
                <td style={{ color:'var(--text-muted)', fontSize:12 }}>{formatDate(t.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── KB PAGE ──────────────────────────────────────────────────────────────────
function KBPage({ allKbArticles }: { allKbArticles: KBArticle[] }) {
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const filtered = allKbArticles.filter(a => !search || a.title.toLowerCase().includes(search.toLowerCase()));
  return (
    <div>
      <div style={{ marginBottom:20 }}>
        <input className="input" placeholder="Cari artikel solusi..." style={{ maxWidth:480 }} value={search} onChange={e => setSearch(e.target.value)} />
      </div>
      <div className="kb-list">
        {filtered.map(a => (
          <div key={a.id} className="kb-item" onClick={() => setExpandedId(prev => prev === a.id ? null : a.id)}>
            <div className="kb-title">{a.title}</div>
            <div className="kb-meta">
              <span>{a.category}</span><span>·</span>
              <span>{a.views} kali dibaca</span><span>·</span>
              <span>Update {formatDate(a.updated)}</span>
            </div>
            {expandedId === a.id && (
              <div style={{ marginTop:12, paddingTop:12, borderTop:'1px solid var(--border)', fontSize:13, lineHeight:1.6, color:'var(--text)', whiteSpace:'pre-wrap' }}>
                {a.body || 'Belum ada konten untuk artikel ini.'}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const router = useRouter();
  const { teams: allTeams, pics: allPics, apps: allApps, slaRules: allSlaRules, kbArticles: allKbArticles, loading: masterLoading } = useMasterData();
  const { tickets: allTickets, setTickets: setAllTickets, loading: ticketsLoading } = useTickets();
  const [session, setSession] = useState<Session | null>(null);
  const [page, setPage] = useState('home');
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [showSubmit, setShowSubmit] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: string } | null>(null);
  const [currentNav, setCurrentNav] = useState<'home' | 'tickets' | 'kb'>('home');

  useEffect(() => {
    const s = getSession();
    if (!s) { router.replace('/login'); return; }
    setSession(s);
  }, [router]);

  const showToast = (msg: string, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 5000);
  };

  const sendTicketEmail = async (ticket: Ticket) => {
    if (!emailConfig.enabled) { showToast('Email notifikasi belum aktif', 'warn'); return; }
    const team = allTeams.find(t => t.id === ticket.assigneeTeamId);
    try {
      await emailjs.send(emailConfig.serviceId, emailConfig.templateId, {
        to_email: emailConfig.notifyEmail, ticket_id: ticket.id,
        ticket_subject: ticket.subject, ticket_from: ticket.fromName,
        ticket_email: ticket.from, ticket_team: team?.name || '-',
        ticket_pic: ticket.assignedName, ticket_app: ticket.app,
        ticket_task: ticket.specificTask, ticket_priority: ticket.priority,
        ticket_category: ticket.category, ticket_body: ticket.body,
        created_at: new Date(ticket.createdAt).toLocaleString('id-ID'),
      }, emailConfig.publicKey);
      showToast('Email notifikasi terkirim ke ' + emailConfig.notifyEmail);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast('Tiket tersimpan. Gagal kirim email: ' + msg, 'error');
    }
  };

  const addComment = async (id: string, comment: Omit<Comment, 'isInternal'>) => {
    const target = allTickets.find(t => t.id === id);
    if (!target) return;
    const cmt: Comment = { ...comment, isInternal: false };
    const activityItem: ActivityItem = { type: 'comment', time: comment.time, who: comment.authorName, isInternal: false };
    const updatedAt = new Date().toISOString();
    setAllTickets(prev => prev.map(t => t.id === id ? { ...t, comments: [...(t.comments || []), cmt], activity: [...(t.activity || []), activityItem], updatedAt } : t));
    await appendTicketEvent(id, { comments: [cmt], activity: [activityItem] });
  };

  const saveCsat = async (id: string, rating: number) => {
    setAllTickets(prev => prev.map(t => t.id === id ? { ...t, csat: rating } : t));
    await updateTicketFields(id, { csat: rating });
  };

  // Nav page handler
  const handleNavClick = (nav: typeof currentNav) => {
    setCurrentNav(nav);
    setPage(nav === 'home' ? 'home' : nav === 'tickets' ? 'tickets' : 'kb');
  };

  if (!session || masterLoading || ticketsLoading) return null;

  const myTickets = allTickets.filter(t => t.from === session.email);

  const stats = {
    open:  myTickets.filter(t => ['Open','In Progress','Pending','Revisi'].includes(t.status)).length,
    done:  myTickets.filter(t => ['Done','Closed'].includes(t.status)).length,
    total: myTickets.length,
  };

  const selectedTicket = selectedTicketId ? myTickets.find(t => t.id === selectedTicketId) ?? null : null;

  const pageTitle = page === 'home' ? 'Beranda' : page === 'tickets' ? 'Tiket Saya' : 'Knowledge Base';

  return (
    <div className="sw-app">
      {/* TOP NAV */}
      <div className="sw-topbar">
        <div className="sw-logo">🛠 IT Helpdesk</div>
        <nav className="sw-nav">
          <NavLink icon="🏠" label="Beranda" active={currentNav === 'home'} onClick={() => handleNavClick('home')} />
          <NavLink icon="🎫" label="Tiket Saya" active={currentNav === 'tickets'} onClick={() => handleNavClick('tickets')} />
          <NavLink icon="📚" label="Knowledge Base" active={currentNav === 'kb'} onClick={() => handleNavClick('kb')} />
        </nav>
        <div className="sw-topbar-right">
          <div className="sw-user-avatar">{session.initials}</div>
          <button style={{ fontSize:11, padding:'6px 12px', border:'1px solid var(--border)', borderRadius:6, background:'none', color:'var(--text-secondary)', cursor:'pointer' }} onClick={() => { logout(); router.replace('/login'); }}>Logout</button>
        </div>
      </div>

      {/* SECONDARY BAR */}
      <div className="sw-secondbar">
        <div className="sw-secondbar-inner">
          <span className="sw-secondbar-title">IT Helpdesk</span>
          <span className="sw-sep">/</span>
          <span className="sw-secondbar-page">User Portal</span>
        </div>
        <button className="sw-btn-primary" onClick={() => setShowSubmit(true)}>+ Buat Tiket Baru</button>
      </div>

      {/* CONTENT */}
      <div style={{ flex:1, overflow:'auto', padding:24 }}>
        {page === 'home' && <HomePage stats={stats} tickets={myTickets} onTicketClick={t => setSelectedTicketId(t.id)} onNewTicket={() => setShowSubmit(true)} />}
        {page === 'tickets' && <TicketsPage tickets={myTickets} onTicketClick={t => setSelectedTicketId(t.id)} />}
        {page === 'kb' && <KBPage allKbArticles={allKbArticles} />}
      </div>

      {toast && <Toast toast={toast} />}
      {showSubmit && (
        <SubmitModal
          session={session}
          allPics={allPics}
          allTeams={allTeams}
          allApps={allApps}
          allSlaRules={allSlaRules}
          onClose={() => setShowSubmit(false)}
          onSubmit={t => { setAllTickets(prev => [t, ...prev]); setShowSubmit(false); sendTicketEmail(t); }}
        />
      )}
      {selectedTicket && (
        <TicketDetailModal
          ticket={selectedTicket}
          session={session}
          onAddComment={addComment}
          onRate={saveCsat}
          onClose={() => setSelectedTicketId(null)}
        />
      )}
    </div>
  );
}