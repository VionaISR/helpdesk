'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getSession, logout } from '@/lib/auth';
import { useTickets, updateTicketFields, deleteTicket } from '@/lib/ticket-store';
import { SEED_ACCOUNTS } from '@/lib/account-store';
import { adminCreateAccount, adminUpdateAccount, adminDeleteAccount } from '@/lib/admin-accounts';
import { sendWelcomeEmail } from '@/lib/email';
import { specificTasks, sampleUsers } from '@/lib/data';
import { formatDate, statusClass, slaProgress } from '@/lib/utils';
import { useMasterData, createPic, updatePic, deactivatePic, createCategory, updateCategory, deleteCategory, nextColor, createApp, updateApp, deleteApp, setAppPic, updateSlaRule, createKbArticle, updateKbArticle, deleteKbArticle, fetchUserProfiles, fetchAppUsers, markAppUserEmailSent, type UserProfile } from '@/lib/master-data';
import { seedTickets } from '@/lib/data';
import type { Ticket, TicketStatus, Session, PIC, Category, App, Team, SlaRule, KBArticle } from '@/types';

const SEED_TICKET_IDS = new Set(seedTickets.map(t => t.id));

// ─── ICONS ────────────────────────────────────────────────────────────────────
function TrashIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ display:'inline-block', verticalAlign:'middle', marginRight:4 }}>
      <polyline points="3,6 5,6 21,6" />
      <path d="M19,6v14a2,2,0,0,1-2,2H7a2,2,0,0,1-2-2V6m3,0V4a2,2,0,0,1,2-2h4a2,2,0,0,1,2,2v2" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ display:'inline-block', verticalAlign:'middle', marginRight:4 }}>
      <path d="M11,4H4a2,2,0,0,0-2,2v14a2,2,0,0,0,2,2H18a2,2,0,0,0,2-2V13" />
      <path d="M18.5,2.5a2.121,2.121,0,0,1,3,3L12,15l-4,1,1-4Z" />
    </svg>
  );
}

// ─── CONFIRM MODAL ─────────────────────────────────────────────────────────────
type ConfirmState = { message: string; onConfirm: () => void };

function ConfirmModal({ message, onConfirm, onClose }: { message: string; onConfirm: () => void; onClose: () => void }) {
  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 200 }}>
      <div className="modal" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
            <div className="modal-title">Konfirmasi Hapus</div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <p style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--text-muted)' }}>{message}</p>
          <p style={{ fontSize: 12, color: 'var(--text-subtle)', marginTop: 8 }}>Tindakan ini tidak dapat dibatalkan.</p>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Batal</button>
          <button
            className="btn"
            style={{ background: '#dc2626', color: 'white' }}
            onClick={() => { onConfirm(); onClose(); }}
          >
            <TrashIcon />Ya, Hapus
          </button>
        </div>
      </div>
    </div>
  );
}

function NavItem({ label, count, active, onClick }: { label: string; count?: number; active: boolean; onClick: () => void }) {
  return (
    <a className={`nav-item${active?' active':''}`} onClick={onClick}>
      <span>{label}</span>
      {count !== undefined && <span className="nav-count">{count}</span>}
    </a>
  );
}

// ─── METRIC HELPERS (real numbers, computed from ticket data) ──────────────────
// Resolution time in hours (createdAt → resolvedAt); null if not resolved.
function resolutionHours(t: Ticket): number | null {
  if (!t.resolvedAt) return null;
  return (new Date(t.resolvedAt).getTime() - new Date(t.createdAt).getTime()) / 3600000;
}
// Did the ticket meet its SLA? resolved → by deadline; still open → not past it yet.
// null when there's no deadline to judge against.
function metSla(t: Ticket): boolean | null {
  if (!t.slaDeadline) return null;
  const due = new Date(t.slaDeadline).getTime();
  if (t.resolvedAt) return new Date(t.resolvedAt).getTime() <= due;
  return Date.now() <= due;
}
function avg(nums: number[]): number | null {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
}
function fmtHours(h: number | null): string {
  if (h == null) return '–';
  return h < 1 ? `${Math.round(h * 60)} min` : `${h.toFixed(1)} jam`;
}
function slaCompliancePct(tickets: Ticket[]): number | null {
  const judged = tickets.map(metSla).filter((v): v is boolean => v !== null);
  return judged.length ? Math.round((judged.filter(Boolean).length / judged.length) * 100) : null;
}
function sameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

// ─── DASHBOARD PAGE ────────────────────────────────────────────────────────────
function DashboardPage({ tickets, allCategories }: { tickets: Ticket[]; allCategories: Category[] }) {
  const totalTickets = tickets.length;
  const openTickets = tickets.filter(t => ['Open','In Progress','Pending','Revisi'].includes(t.status)).length;
  const slaBreaches = tickets.filter(t => slaProgress(t.createdAt, t.slaDeadline).breached && ['Open','In Progress','Pending','Revisi'].includes(t.status)).length;
  const categoryVolume = allCategories.map(c => ({ ...c, count: tickets.filter(t => t.category === c.id).length }));
  const maxVolume = Math.max(...categoryVolume.map(c => c.count), 1);
  const slaCompliance = slaCompliancePct(tickets);

  // Month-over-month volume trend (real).
  const now = new Date();
  const thisMonth = tickets.filter(t => sameMonth(new Date(t.createdAt), now)).length;
  const lastMonthRef = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonth = tickets.filter(t => sameMonth(new Date(t.createdAt), lastMonthRef)).length;
  const momPct = lastMonth ? Math.round(((thisMonth - lastMonth) / lastMonth) * 100) : null;

  // Real volume for the last 7 days.
  const dayNames = ['Min','Sen','Sel','Rab','Kam','Jum','Sab'];
  const weeklyData = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (6 - i));
    const next = new Date(d); next.setDate(d.getDate() + 1);
    const count = tickets.filter(t => { const c = new Date(t.createdAt); return c >= d && c < next; }).length;
    return { day: dayNames[d.getDay()], count };
  });
  const maxDay = Math.max(...weeklyData.map(d => d.count), 1);

  // CSAT from real ratings (fills in once ticket.csat is saved).
  const csatValues = tickets.map(t => t.csat).filter((v): v is number => typeof v === 'number');
  const csatAvg = avg(csatValues);
  const csatDist = [5, 4, 3, 2, 1].map(n => csatValues.filter(v => v === n).length);

  return (
    <div>
      <div className="stat-grid">
        <div className="stat"><div className="stat-label">Total tiket</div><div className="stat-value">{totalTickets}</div><div className={`stat-trend ${momPct != null && momPct < 0 ? 'down' : 'up'}`}>{momPct == null ? `${thisMonth} bulan ini` : `${momPct >= 0 ? '+' : ''}${momPct}% dari bulan lalu`}</div></div>
        <div className="stat"><div className="stat-label">Tiket aktif</div><div className="stat-value">{openTickets}</div><div className="stat-trend">Sedang ditangani</div></div>
        <div className="stat"><div className="stat-label">SLA compliance</div><div className="stat-value">{slaCompliance == null ? '–' : `${slaCompliance}%`}</div><div className="stat-trend up">Target: 90%</div></div>
        <div className="stat"><div className="stat-label">SLA breach</div><div className="stat-value">{slaBreaches}</div><div className="stat-trend down">Perlu eskalasi</div></div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:16, marginBottom:16 }}>
        <div className="card">
          <div className="card-header"><div className="card-title">Volume tiket — 7 hari terakhir</div><div className="card-subtitle">Total: {weeklyData.reduce((a,b)=>a+b.count,0)} tiket</div></div>
          <div className="card-body">
            <div style={{ display:'flex', alignItems:'flex-end', gap:12, height:180, paddingTop:20 }}>
              {weeklyData.map((d,i) => (
                <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:8 }}>
                  <div style={{ fontSize:11, color:'var(--text-muted)', fontWeight:500 }}>{d.count}</div>
                  <div style={{ width:'100%', height:`${(d.count/maxDay)*140}px`, background:'var(--accent)', borderRadius:'4px 4px 0 0' }}></div>
                  <div style={{ fontSize:11, color:'var(--text-muted)' }}>{d.day}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="card">
          <div className="card-header"><div className="card-title">CSAT Rating</div><div className="card-subtitle">Rata-rata kepuasan user</div></div>
          <div className="card-body" style={{ textAlign:'center', padding:'24px 20px' }}>
            <div style={{ fontSize:48, fontWeight:600, letterSpacing:'-0.03em', lineHeight:1 }}>{csatAvg == null ? '–' : csatAvg.toFixed(1)}<span style={{ fontSize:24, color:'var(--text-muted)' }}>/5</span></div>
            <div style={{ fontSize:12, color:'var(--text-muted)', marginTop:8 }}>{csatValues.length === 0 ? 'Belum ada rating' : `Dari ${csatValues.length} rating`}</div>
            <div style={{ marginTop:16, display:'flex', flexDirection:'column', gap:6 }}>
              {[5,4,3,2,1].map((n, idx) => (
                <div key={n} style={{ display:'flex', alignItems:'center', gap:8, fontSize:11 }}>
                  <span style={{ width:12 }}>{n}</span>
                  <div style={{ flex:1, height:6, background:'var(--surface-2)', borderRadius:3, overflow:'hidden' }}>
                    <div style={{ width: `${csatValues.length ? (csatDist[idx] / csatValues.length) * 100 : 0}%`, height:'100%', background:'var(--accent)' }}></div>
                  </div>
                  <span style={{ width:18, textAlign:'right', color:'var(--text-muted)' }}>{csatDist[idx]}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><div className="card-title">Volume per kategori</div></div>
        <div className="card-body">
          {categoryVolume.map(c => (
            <div key={c.id} style={{ marginBottom:12 }}>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, marginBottom:4 }}>
                <span style={{ fontWeight:500 }}>{c.name}</span><span className="mono" style={{ color:'var(--text-muted)' }}>{c.count}</span>
              </div>
              <div style={{ height:6, background:'var(--surface-2)', borderRadius:3, overflow:'hidden' }}>
                <div style={{ width:`${(c.count/maxVolume)*100}%`, height:'100%', background:'var(--accent)', borderRadius:3 }}></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── REPORTING ─────────────────────────────────────────────────────────────────
function ReportingPage({ allPics, tickets }: { allPics: PIC[]; tickets: Ticket[] }) {
  const resolved = tickets.filter(t => ['Done', 'Closed'].includes(t.status));
  const active = tickets.filter(t => ['Open', 'In Progress', 'Pending', 'Revisi'].includes(t.status));
  const avgResolution = avg(resolved.map(resolutionHours).filter((v): v is number => v != null));
  const sla = slaCompliancePct(tickets);

  const picRows = allPics
    .map(p => {
      const own = tickets.filter(t => t.assignedToId === p.id);
      const done = own.filter(t => ['Done', 'Closed'].includes(t.status));
      const resHours = done.map(resolutionHours).filter((v): v is number => v != null);
      const csat = own.map(t => t.csat).filter((v): v is number => typeof v === 'number');
      return {
        pic: p,
        assigned: own.length,
        done: done.length,
        avgRes: avg(resHours),
        sla: slaCompliancePct(done),
        csat: csat.length ? avg(csat) : null,
      };
    })
    .filter(r => r.assigned > 0)
    .sort((a, b) => b.done - a.done);

  return (
    <div>
      <div className="stat-grid">
        <div className="stat"><div className="stat-label">Tiket selesai</div><div className="stat-value">{resolved.length}</div><div className="stat-trend">dari {tickets.length} total</div></div>
        <div className="stat"><div className="stat-label">Avg resolution time</div><div className="stat-value">{fmtHours(avgResolution)}</div><div className="stat-trend">semua waktu</div></div>
        <div className="stat"><div className="stat-label">SLA compliance</div><div className="stat-value">{sla == null ? '–' : `${sla}%`}</div><div className="stat-trend">Target: 90%</div></div>
        <div className="stat"><div className="stat-label">Tiket aktif</div><div className="stat-value">{active.length}</div><div className="stat-trend">belum selesai</div></div>
      </div>
      <div className="card">
        <div className="card-header"><div className="card-title">Performa PIC</div><div className="card-subtitle">Semua waktu · {picRows.length} PIC dengan tiket</div></div>
        {picRows.length === 0 ? (
          <div className="card-body" style={{ color: 'var(--text-muted)', fontSize: 13 }}>Belum ada tiket yang ditugaskan ke PIC.</div>
        ) : (
          <table className="table">
            <thead><tr><th>PIC</th><th>Ditugaskan</th><th>Selesai</th><th>Avg resolution</th><th>SLA compliance</th><th>CSAT</th></tr></thead>
            <tbody>
              {picRows.map(r => (
                <tr key={r.pic.id}>
                  <td><div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><div className="user-avatar" style={{ width: 24, height: 24, fontSize: 10 }}>{r.pic.initials}</div><div style={{ fontWeight: 500 }}>{r.pic.name}</div></div></td>
                  <td>{r.assigned}</td>
                  <td>{r.done}</td>
                  <td>{fmtHours(r.avgRes)}</td>
                  <td>{r.sla == null ? '–' : <span style={{ fontWeight: 500, color: r.sla >= 90 ? 'var(--status-done)' : 'var(--priority-medium)' }}>{r.sla}%</span>}</td>
                  <td>{r.csat == null ? '–' : `${r.csat.toFixed(1)} / 5`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── KB MANAGER ────────────────────────────────────────────────────────────────
function KBManagerPage({ allCategories, allKbArticles, onKbChange }: { allCategories: Category[]; allKbArticles: KBArticle[]; onKbChange: () => Promise<void> }) {
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ title: '', category: allCategories[0]?.id ?? '', body: '', isPublished: true });
  const [addError, setAddError] = useState('');
  const [editArticle, setEditArticle] = useState<KBArticle | null>(null);
  const [editForm, setEditForm] = useState({ title: '', category: '', body: '', isPublished: true });
  const [editError, setEditError] = useState('');
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

  let visible = allKbArticles;
  if (search.trim()) { const q = search.toLowerCase(); visible = visible.filter(a => a.title.toLowerCase().includes(q)); }
  if (filterCat) visible = visible.filter(a => a.category === filterCat);

  const openAdd = () => {
    setAddForm({ title: '', category: allCategories[0]?.id ?? '', body: '', isPublished: true });
    setAddError('');
    setShowAdd(true);
  };

  const handleAdd = async () => {
    const title = addForm.title.trim();
    if (!title) { setAddError('Judul wajib diisi.'); return; }
    if (!addForm.category) { setAddError('Kategori wajib dipilih.'); return; }
    try {
      await createKbArticle({ title, category: addForm.category, body: addForm.body, isPublished: addForm.isPublished });
      await onKbChange();
      setShowAdd(false);
    } catch {
      setAddError('Gagal menyimpan artikel. Coba lagi.');
    }
  };

  const openEdit = (a: KBArticle) => {
    setEditArticle(a);
    setEditForm({ title: a.title, category: a.category, body: a.body ?? '', isPublished: a.isPublished ?? true });
    setEditError('');
  };

  const handleEdit = async () => {
    if (!editArticle) return;
    const title = editForm.title.trim();
    if (!title) { setEditError('Judul wajib diisi.'); return; }
    try {
      await updateKbArticle(editArticle.id, { title, category: editForm.category, body: editForm.body, isPublished: editForm.isPublished });
      await onKbChange();
      setEditArticle(null);
    } catch {
      setEditError('Gagal menyimpan perubahan. Coba lagi.');
    }
  };

  const handleDelete = (a: KBArticle) => {
    setConfirmState({
      message: `Hapus artikel "${a.title}"?`,
      onConfirm: async () => {
        await deleteKbArticle(a.id);
        await onKbChange();
        setEditArticle(null);
      },
    });
  };

  return (
    <div>
      <div className="filters">
        <input className="filter-input" placeholder="Cari artikel..." value={search} onChange={e => setSearch(e.target.value)} />
        <select className="filter-select" value={filterCat} onChange={e => setFilterCat(e.target.value)}>
          <option value="">Semua kategori</option>
          {allCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <div style={{ marginLeft:'auto' }}><button className="btn btn-primary btn-sm" onClick={openAdd}>+ Artikel Baru</button></div>
      </div>
      <div className="card">
        <table className="table">
          <thead><tr><th>Judul</th><th>Kategori</th><th>Status</th><th>Views</th><th>Update terakhir</th><th></th></tr></thead>
          <tbody>
            {visible.map(a => (
              <tr key={a.id}>
                <td style={{ fontWeight:500 }}>{a.title}</td>
                <td>{a.category}</td>
                <td><span className={`badge ${a.isPublished ? 'status-done' : 'status-closed'}`}><span className="badge-dot"></span>{a.isPublished ? 'Published' : 'Draft'}</span></td>
                <td className="mono" style={{ fontSize:12, color:'var(--text-muted)' }}>{a.views}</td>
                <td style={{ fontSize:12, color:'var(--text-muted)' }}>{formatDate(a.updated)}</td>
                <td><button className="btn btn-ghost btn-sm" onClick={() => openEdit(a)}><PencilIcon />Edit</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <div className="modal-overlay" onClick={() => setShowAdd(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header"><div className="modal-title">Artikel Baru</div><button className="btn btn-ghost btn-sm" onClick={() => setShowAdd(false)}>✕</button></div>
            <div className="modal-body">
              <div className="field"><label className="label">Judul</label><input className="input" placeholder="Contoh: Cara reset password Outlook" value={addForm.title} onChange={e => setAddForm(f => ({ ...f, title: e.target.value }))} /></div>
              <div className="field">
                <label className="label">Kategori</label>
                <select className="select" value={addForm.category} onChange={e => setAddForm(f => ({ ...f, category: e.target.value }))}>
                  {allCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="field"><label className="label">Isi artikel</label><textarea className="textarea" placeholder="Tulis konten artikel..." style={{ minHeight:180 }} value={addForm.body} onChange={e => setAddForm(f => ({ ...f, body: e.target.value }))} /></div>
              <div className="field"><label className="label" style={{ display:'flex', alignItems:'center', gap:8 }}><input type="checkbox" checked={addForm.isPublished} onChange={e => setAddForm(f => ({ ...f, isPublished: e.target.checked }))} /> Published</label></div>
              {addError && <div style={{ fontSize:12, color:'#dc2626', marginTop:4 }}>{addError}</div>}
            </div>
            <div className="modal-footer"><button className="btn btn-secondary" onClick={() => setShowAdd(false)}>Batal</button><button className="btn btn-primary" onClick={handleAdd}>Publish</button></div>
          </div>
        </div>
      )}

      {editArticle && (
        <div className="modal-overlay" onClick={() => setEditArticle(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header"><div className="modal-title">Edit Artikel</div><button className="btn btn-ghost btn-sm" onClick={() => setEditArticle(null)}>✕</button></div>
            <div className="modal-body">
              <div className="field"><label className="label">Judul</label><input className="input" value={editForm.title} onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))} /></div>
              <div className="field">
                <label className="label">Kategori</label>
                <select className="select" value={editForm.category} onChange={e => setEditForm(f => ({ ...f, category: e.target.value }))}>
                  {allCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="field"><label className="label">Isi artikel</label><textarea className="textarea" style={{ minHeight:180 }} value={editForm.body} onChange={e => setEditForm(f => ({ ...f, body: e.target.value }))} /></div>
              <div className="field"><label className="label" style={{ display:'flex', alignItems:'center', gap:8 }}><input type="checkbox" checked={editForm.isPublished} onChange={e => setEditForm(f => ({ ...f, isPublished: e.target.checked }))} /> Published</label></div>
              {editError && <div style={{ fontSize:12, color:'#dc2626', marginTop:4 }}>{editError}</div>}
            </div>
            <div className="modal-footer" style={{ justifyContent:'space-between' }}>
              <button className="btn btn-ghost btn-sm" style={{ color:'#dc2626' }} onClick={() => handleDelete(editArticle)}><TrashIcon />Hapus</button>
              <div style={{ display:'flex', gap:8 }}>
                <button className="btn btn-secondary" onClick={() => setEditArticle(null)}>Batal</button>
                <button className="btn btn-primary" onClick={handleEdit}>Simpan</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {confirmState && <ConfirmModal message={confirmState.message} onConfirm={confirmState.onConfirm} onClose={() => setConfirmState(null)} />}
    </div>
  );
}

// ─── TICKET EDIT MODAL ─────────────────────────────────────────────────────────
function TicketEditModal({ ticket, onChange, onSave, onClose, allPics, allCategories, allTeams, allApps, allSlaRules }: { ticket: Ticket; onChange: (fn: (t: Ticket) => Ticket) => void; onSave: (t: Ticket) => void; onClose: () => void; allPics: PIC[]; allCategories: Category[]; allTeams: Team[]; allApps: App[]; allSlaRules: SlaRule[] }) {
  const set = (key: keyof Ticket) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const val = e.target.value;
    onChange(prev => {
      const next = { ...prev, [key]: val } as Ticket;
      if (key === 'assigneeTeamId') next.assignedToId = null;
      if (key === 'assignedToId') { const pic = allPics.find(p => p.id === val); if (pic) next.assignedName = pic.name; }
      if (key === 'app') { const app = allApps.find(a => a.name === val); if (app) next.category = app.prefix; }
      return next;
    });
  };
  const picOptions = allPics;
  const setDate = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (!val) return;
    const iso = new Date(val).toISOString();
    onChange(prev => {
      const hours = allSlaRules.find(s => s.priority === prev.priority)?.targetHours ?? 24;
      return {
        ...prev,
        createdAt: iso,
        slaDeadline: new Date(new Date(val).getTime() + hours * 3600 * 1000).toISOString(),
      };
    });
  };
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth:620 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header"><div><div className="modal-title">Edit Parameter Tiket</div><div style={{ fontSize:11, color:'var(--text-muted)', marginTop:2 }}>{ticket.id} · {ticket.subject}</div></div><button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button></div>
        <div className="modal-body">
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
            <div className="field"><label className="label">Kategori</label><select className="select" value={ticket.category||''} onChange={set('category')}><option value="">— Pilih —</option>{allCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
            <div className="field"><label className="label">Assignee Team</label><select className="select" value={ticket.assigneeTeamId||''} onChange={set('assigneeTeamId')}><option value="">— Pilih —</option>{allTeams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
            <div className="field"><label className="label">PIC</label><select className="select" value={ticket.assignedToId||''} onChange={set('assignedToId')}><option value="">— Pilih —</option>{picOptions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
            <div className="field"><label className="label">Priority</label><select className="select" value={ticket.priority||'Medium'} onChange={set('priority')}>{['Low','Medium','High','Critical'].map(p => <option key={p} value={p}>{p}</option>)}</select></div>
            <div className="field"><label className="label">Status</label><select className="select" value={ticket.status||'Open'} onChange={set('status')}>{['Open','In Progress','Pending','Revisi','Done','Closed'].map(s => <option key={s} value={s}>{s}</option>)}</select></div>
            <div className="field"><label className="label">Application</label><select className="select" value={ticket.app||''} onChange={set('app')}><option value="">— Pilih —</option>{allApps.map(a => <option key={a.name} value={a.name}>{a.name}</option>)}</select></div>
            <div className="field"><label className="label">Tanggal Dibuat</label><input type="datetime-local" className="input" value={ticket.createdAt ? ticket.createdAt.slice(0,16) : ''} onChange={setDate} /><div className="field-hint">SLA deadline otomatis +24 jam dari tanggal ini</div></div>
            <div className="field"><label className="label">Tanggal Selesai</label><input type="datetime-local" className="input" value={ticket.resolvedAt ? ticket.resolvedAt.slice(0,16) : ''} onChange={e => onChange(prev => ({ ...prev, resolvedAt: e.target.value ? new Date(e.target.value).toISOString() : undefined }))} /><div className="field-hint">Kosongkan jika belum selesai</div></div>
          </div>
          <div className="field"><label className="label">Specific Task</label><select className="select" value={ticket.specificTask||''} onChange={set('specificTask')}><option value="">— Pilih —</option>{specificTasks.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}</select></div>
          <div className="field"><label className="label">Subject</label><input className="input" value={ticket.subject||''} onChange={set('subject')} /></div>
        </div>
        <div className="modal-footer"><button className="btn btn-secondary" onClick={onClose}>Batal</button><button className="btn btn-primary" onClick={() => onSave(ticket)}>Simpan Perubahan</button></div>
      </div>
    </div>
  );
}

// ─── ALL TICKETS ───────────────────────────────────────────────────────────────
function AllTicketsPage({ tickets, setTickets, allPics, allCategories, allTeams, allApps, allSlaRules, baseFilter }: { tickets: Ticket[]; setTickets: React.Dispatch<React.SetStateAction<Ticket[]>>; allPics: PIC[]; allCategories: Category[]; allTeams: Team[]; allApps: App[]; allSlaRules: SlaRule[]; baseFilter?: TicketStatus[] }) {
  const [editTarget, setEditTarget] = useState<Ticket | null>(null);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [filterPic, setFilterPic] = useState('');
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

  const statusOptions = baseFilter ?? ['Open','In Progress','Pending','Revisi','Done','Closed'];

  let visible = tickets;
  if (baseFilter) visible = visible.filter(t => baseFilter.includes(t.status));
  if (search.trim()) { const q = search.toLowerCase(); visible = visible.filter(t => t.subject.toLowerCase().includes(q)||t.id.toLowerCase().includes(q)||t.fromName.toLowerCase().includes(q)); }
  if (filterStatus) visible = visible.filter(t => t.status === filterStatus);
  if (filterCat) visible = visible.filter(t => t.category === filterCat);
  if (filterPic) visible = visible.filter(t => t.assignedToId === filterPic);


  const saveEdit = async (updated: Ticket) => {
    const now = new Date().toISOString();
    const prev = tickets.find(t => t.id === updated.id);
    const statusChanged = prev?.status !== updated.status;
    const merged: Ticket = { ...updated, updatedAt: now, resolvedAt: (['Done','Closed'].includes(updated.status) && !updated.resolvedAt) ? now : updated.resolvedAt, activity: statusChanged ? [...(updated.activity||[]), { type:'system', time:now, text:`Status: ${prev?.status} → ${updated.status} (Manual Admin)` }] : updated.activity };
    setTickets(prev => prev.map(t => t.id === merged.id ? merged : t));
    setEditTarget(null);
    await updateTicketFields(merged.id, merged);
  };

  const closeSingle = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const now = new Date().toISOString();
    const t = tickets.find(t => t.id === id);
    if (!t) return;
    const merged: Ticket = { ...t, status:'Closed', updatedAt:now, resolvedAt:t.resolvedAt||now, activity:[...(t.activity||[]),{ type:'system',time:now,text:`Status: ${t.status} → Closed (Manual Admin)` }] };
    setTickets(prev => prev.map(x => x.id===id?merged:x));
    await updateTicketFields(id, merged);
  };

  const deleteSingle = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmState({
      message: 'Hapus tiket ini?',
      onConfirm: () => { setTickets(prev => prev.filter(x => x.id !== id)); deleteTicket(id); },
    });
  };

  return (
    <div>
      <div className="filters">
        <input className="filter-input" placeholder="Cari tiket..." value={search} onChange={e => setSearch(e.target.value)} />
        <select className="filter-select" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}><option value="">Semua status</option>{statusOptions.map(s=><option key={s} value={s}>{s}</option>)}</select>
        <select className="filter-select" value={filterCat} onChange={e => setFilterCat(e.target.value)}><option value="">Semua kategori</option>{allCategories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <select className="filter-select" value={filterPic} onChange={e => setFilterPic(e.target.value)}><option value="">Semua PIC</option>{allPics.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>
      </div>
      <div style={{ fontSize:12, color:'var(--text-muted)', marginBottom:8 }}>Klik baris untuk edit · {visible.length} tiket ditampilkan.</div>
      <div className="card">
        <table className="table">
          <thead><tr><th>ID</th><th>Subject</th><th>User</th><th>Kategori</th><th>Priority</th><th>Status</th><th>PIC</th><th>Tanggal</th><th>Aksi</th></tr></thead>
          <tbody>
            {visible.map(t => (
              <tr key={t.id} onClick={() => setEditTarget({ ...t })}>
                <td className="mono" style={{ fontSize:11, color:'var(--text-muted)' }}>{t.id}</td>
                <td style={{ fontWeight:500 }}>{t.subject}</td>
                <td style={{ fontSize:12 }}>{t.fromName}</td>
                <td style={{ fontSize:12 }}>{t.category}</td>
                <td><span className={`priority priority-${t.priority.toLowerCase()}`}><span className="priority-bar"></span>{t.priority}</span></td>
                <td><span className={`badge ${statusClass(t.status)}`}><span className="badge-dot"></span>{t.status}</span></td>
                <td style={{ fontSize:12 }}>{t.assignedName}</td>
                <td style={{ fontSize:12, color:'var(--text-muted)' }}>{formatDate(t.createdAt)}</td>
                <td onClick={e => e.stopPropagation()} style={{ whiteSpace:'nowrap' }}>
                  {t.status !== 'Closed' && <button className="btn btn-secondary btn-sm" style={{ fontSize:11, padding:'2px 8px' }} onClick={e => closeSingle(t.id, e)}>Tutup</button>}
                  {!SEED_TICKET_IDS.has(t.id) && (
                    <button className="btn btn-ghost btn-sm" style={{ fontSize:11, padding:'2px 8px', color:'#dc2626', marginLeft:4 }} title="Hapus tiket" onClick={e => deleteSingle(t.id, e)}><TrashIcon />Hapus</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editTarget && <TicketEditModal ticket={editTarget} onChange={fn => setEditTarget(prev => prev ? fn(prev) : prev)} onSave={saveEdit} onClose={() => setEditTarget(null)} allPics={allPics} allCategories={allCategories} allTeams={allTeams} allApps={allApps} allSlaRules={allSlaRules} />}
      {confirmState && <ConfirmModal message={confirmState.message} onConfirm={confirmState.onConfirm} onClose={() => setConfirmState(null)} />}
    </div>
  );
}

// ─── ROUTING RULES ────────────────────────────────────────────────────────────
const PAGE_SIZE = 15;

function RoutingRulesPage({ allPics, allApps, allTeams, onRulesChange }: { allPics: PIC[]; allApps: App[]; allTeams: Team[]; onRulesChange: () => Promise<void> }) {
  const [search, setSearch] = useState('');
  const [editApp, setEditApp] = useState<App | null>(null);
  const [editPicId, setEditPicId] = useState('');
  const [page, setPage] = useState(1);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

  // Reset ke page 1 saat search berubah
  useEffect(() => { setPage(1); }, [search]);

  const openEdit = (app: App) => {
    setEditPicId(app.picId ?? '');
    setEditApp(app);
  };

  const saveRule = async () => {
    if (!editApp?.id) return;
    await setAppPic(editApp.id, editPicId || null);
    await onRulesChange();
    setEditApp(null);
  };

  const removeRule = (app: App) => {
    setConfirmState({
      message: `Hapus rule PIC untuk "${app.name}"? Tiket dari aplikasi ini akan masuk Unassigned.`,
      onConfirm: async () => { if (app.id) { await setAppPic(app.id, null); await onRulesChange(); } },
    });
  };

  const configuredCount = allApps.filter(a => a.picId).length;

  const filtered = allApps.filter(a =>
    !search ||
    a.name.toLowerCase().includes(search.toLowerCase()) ||
    a.prefix.toLowerCase().includes(search.toLowerCase())
  );

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div>
      {/* Toolbar */}
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          PIC otomatis di-assign saat user memilih aplikasi tertentu.
          <span style={{ marginLeft: 8, fontWeight: 600, color: 'var(--text)' }}>{configuredCount}/{allApps.length} aplikasi sudah dikonfigurasi</span>
        </div>
        <input
          className="filter-input"
          placeholder="Cari aplikasi atau kategori..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ width: 260 }}
        />
      </div>

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Aplikasi</th>
              <th>Kategori</th>
              <th>PIC yang Ditugaskan</th>
              <th>Tim</th>
              <th style={{ width: 130 }}>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {paginated.map(app => {
              const pic = app.picId ? allPics.find(p => p.id === app.picId) : null;
              const team = pic ? allTeams.find(t => t.id === pic.teamId) : null;
              return (
                <tr key={app.id ?? app.name}>
                  <td style={{ fontWeight: 500 }}>{app.name}</td>
                  <td>
                    <span style={{ fontSize: 11, padding: '2px 6px', background: 'var(--surface-2)', borderRadius: 4, fontFamily: 'var(--mono)' }}>
                      {app.prefix}
                    </span>
                  </td>
                  <td>
                    {pic ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div className="user-avatar" style={{ width: 22, height: 22, fontSize: 9 }}>{pic.initials}</div>
                        <span style={{ fontWeight: 500, color: 'var(--status-done)' }}>{pic.name}</span>
                      </div>
                    ) : (
                      <span style={{ fontSize: 12, color: 'var(--text-subtle)', fontStyle: 'italic' }}>Belum diatur</span>
                    )}
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{team?.name ?? '—'}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => openEdit(app)}>
                        {pic ? 'Ubah' : 'Set PIC'}
                      </button>
                      {pic && (
                        <button className="btn btn-ghost btn-sm" style={{ color: '#dc2626' }} title="Hapus rule PIC" onClick={() => removeRule(app)}>
                          <TrashIcon />Hapus
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Pagination */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {filtered.length === 0 ? 'Tidak ada hasil' : `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, filtered.length)} dari ${filtered.length} aplikasi`}
          </div>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <button
              className="btn btn-secondary btn-sm"
              disabled={page === 1}
              onClick={() => setPage(p => p - 1)}
              style={{ minWidth: 32 }}
            >
              ‹
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
              <button
                key={p}
                className={`btn btn-sm ${p === page ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setPage(p)}
                style={{ minWidth: 32 }}
              >
                {p}
              </button>
            ))}
            <button
              className="btn btn-secondary btn-sm"
              disabled={page === totalPages || totalPages === 0}
              onClick={() => setPage(p => p + 1)}
              style={{ minWidth: 32 }}
            >
              ›
            </button>
          </div>
        </div>
      </div>

      {/* Edit modal */}
      {editApp !== null && (
        <div className="modal-overlay" onClick={() => setEditApp(null)}>
          <div className="modal" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div className="modal-title">Set PIC untuk Aplikasi</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{editApp.name}</div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setEditApp(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="field">
                <label className="label">Pilih PIC</label>
                <select className="input" value={editPicId} onChange={e => setEditPicId(e.target.value)}>
                  <option value="">— Tidak ada / Hapus rule —</option>
                  {allPics.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <div className="field-hint">Kosongkan untuk menghapus rule — tiket akan masuk Unassigned</div>
              </div>
              {editPicId && (() => {
                const p = allPics.find(x => x.id === editPicId);
                return p ? (
                  <div style={{ padding: 10, background: 'var(--surface-2)', borderRadius: 6, fontSize: 12 }}>
                    <span style={{ color: 'var(--text-muted)' }}>Preview: </span>
                    <strong>{p.name}</strong>
                  </div>
                ) : null;
              })()}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setEditApp(null)}>Batal</button>
              <button className="btn btn-primary" onClick={saveRule}>Simpan</button>
            </div>
          </div>
        </div>
      )}
      {confirmState && <ConfirmModal message={confirmState.message} onConfirm={confirmState.onConfirm} onClose={() => setConfirmState(null)} />}
    </div>
  );
}

// ─── CONFIG ────────────────────────────────────────────────────────────────────
function ConfigPage({ tickets, allCategories, allSlaRules, onCategoryChange, onSlaChange }: { tickets: Ticket[]; allCategories: Category[]; allSlaRules: SlaRule[]; onCategoryChange: () => Promise<void>; onSlaChange: () => Promise<void> }) {
  const [showAdd, setShowAdd] = useState(false);
  const [catForm, setCatForm] = useState({ name: '', id: '' });
  const [formError, setFormError] = useState('');
  const [editCat, setEditCat] = useState<Category | null>(null);
  const [editCatName, setEditCatName] = useState('');
  const [editCatError, setEditCatError] = useState('');
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [editSla, setEditSla] = useState<SlaRule | null>(null);
  const [editSlaForm, setEditSlaForm] = useState({ targetHours: 0, warningPercent: 0 });
  const [editSlaError, setEditSlaError] = useState('');

  const handleAdd = async () => {
    const name = catForm.name.trim();
    const id = catForm.id.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!name) { setFormError('Nama kategori wajib diisi.'); return; }
    if (!id || id.length < 2) { setFormError('Kode minimal 2 karakter huruf/angka.'); return; }
    if (allCategories.some(c => c.id === id)) { setFormError('Kode sudah dipakai kategori lain.'); return; }
    try {
      await createCategory({ id, name, color: nextColor(allCategories.length) });
      await onCategoryChange();
      setShowAdd(false);
      setCatForm({ name: '', id: '' });
      setFormError('');
    } catch {
      setFormError('Gagal menyimpan kategori. Coba lagi.');
    }
  };

  const openEditCat = (c: Category) => {
    setEditCat(c);
    setEditCatName(c.name);
    setEditCatError('');
  };

  const handleEditCat = async () => {
    if (!editCat) return;
    const name = editCatName.trim();
    if (!name) { setEditCatError('Nama kategori wajib diisi.'); return; }
    try {
      await updateCategory(editCat.id, { name });
      await onCategoryChange();
      setEditCat(null);
    } catch {
      setEditCatError('Gagal menyimpan perubahan. Coba lagi.');
    }
  };

  const handleDelete = (id: string) => {
    setConfirmState({
      message: 'Hapus kategori ini?',
      onConfirm: async () => { await deleteCategory(id); await onCategoryChange(); },
    });
  };

  const openEditSla = (rule: SlaRule) => {
    setEditSla(rule);
    setEditSlaForm({ targetHours: rule.targetHours, warningPercent: rule.warningPercent });
    setEditSlaError('');
  };

  const handleEditSla = async () => {
    if (!editSla) return;
    if (editSlaForm.targetHours <= 0) { setEditSlaError('SLA (jam) harus lebih dari 0.'); return; }
    if (editSlaForm.warningPercent <= 0 || editSlaForm.warningPercent > 100) { setEditSlaError('Alert breach (%) harus antara 1-100.'); return; }
    try {
      await updateSlaRule(editSla.id, { targetHours: editSlaForm.targetHours, warningPercent: editSlaForm.warningPercent });
      await onSlaChange();
      setEditSla(null);
    } catch {
      setEditSlaError('Gagal menyimpan perubahan. Coba lagi.');
    }
  };

  return (
    <div>
      <div className="card" style={{ marginBottom:16 }}>
        <div className="card-header" style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div>
            <div className="card-title">Kategori Tiket</div>
            <div className="card-subtitle">Atur kategori dan auto-assignment ke PIC</div>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => { setShowAdd(true); setFormError(''); }}>+ Tambah Kategori</button>
        </div>
        <table className="table">
          <thead><tr><th>Kode</th><th>Kategori</th><th>Tiket bulan ini</th><th style={{ width:140 }}>Aksi</th></tr></thead>
          <tbody>
            {allCategories.map(c => (
              <tr key={c.id}>
                <td><span style={{ fontSize:11, padding:'2px 6px', background:'var(--surface-2)', borderRadius:4, fontFamily:'var(--mono)', color: c.color }}>{c.id}</span></td>
                <td style={{ fontWeight:500 }}>{c.name}</td>
                <td className="mono" style={{ fontSize:12, color:'var(--text-muted)' }}>{tickets.filter(t => t.category === c.id).length}</td>
                <td>
                  <div style={{ display:'flex', gap:4 }}>
                    <button className="btn btn-secondary btn-sm" title="Edit kategori" onClick={() => openEditCat(c)}><PencilIcon />Edit</button>
                    <button className="btn btn-ghost btn-sm" style={{ color:'#dc2626' }} title="Hapus kategori" onClick={() => handleDelete(c.id)}><TrashIcon />Hapus</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal Edit Kategori */}
      {editCat && (
        <div className="modal-overlay" onClick={() => setEditCat(null)}>
          <div className="modal" style={{ maxWidth:420 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div className="modal-title">Edit Kategori</div>
                <div style={{ fontSize:12, color:'var(--text-muted)', marginTop:2 }}>Kode: <span style={{ fontFamily:'var(--mono)' }}>{editCat.id}</span></div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setEditCat(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="field">
                <label className="label">Nama Kategori</label>
                <input className="input" value={editCatName} onChange={e => setEditCatName(e.target.value)} />
              </div>
              {editCatError && <div style={{ fontSize:12, color:'#dc2626', marginTop:4 }}>{editCatError}</div>}
            </div>
            <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
              <button className="btn btn-ghost btn-sm" style={{ color:'#dc2626' }} onClick={() => {
                setConfirmState({
                  message: `Hapus kategori "${editCat.name}"?`,
                  onConfirm: async () => {
                    await deleteCategory(editCat.id);
                    await onCategoryChange();
                    setEditCat(null);
                  },
                });
              }}><TrashIcon />Hapus</button>
              <div style={{ display:'flex', gap:8 }}>
                <button className="btn btn-secondary" onClick={() => setEditCat(null)}>Batal</button>
                <button className="btn btn-primary" onClick={handleEditCat}>Simpan</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-header"><div className="card-title">SLA Rules</div><div className="card-subtitle">Deadline penyelesaian berdasarkan priority</div></div>
        <table className="table">
          <thead><tr><th>Priority</th><th>SLA (jam)</th><th>Alert breach</th><th>Eskalasi otomatis</th><th></th></tr></thead>
          <tbody>
            {allSlaRules.map(rule => (
              <tr key={rule.id}>
                <td><span className={`priority priority-${rule.priority.toLowerCase()}`}><span className="priority-bar"></span>{rule.priority}</span></td>
                <td className="mono" style={{ fontSize:13 }}>{rule.targetHours} jam</td>
                <td style={{ fontSize:13 }}>{rule.warningPercent}% threshold</td>
                <td style={{ fontSize:13, color:'var(--text-muted)' }}>{rule.priority === 'Critical' ? 'Eskalasi langsung ke L2' : 'Manual'}</td>
                <td><button className="btn btn-ghost btn-sm" onClick={() => openEditSla(rule)}><PencilIcon />Edit</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editSla && (
        <div className="modal-overlay" onClick={() => setEditSla(null)}>
          <div className="modal" style={{ maxWidth:420 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div className="modal-title">Edit SLA Rule</div>
                <div style={{ fontSize:12, color:'var(--text-muted)', marginTop:2 }}>Priority: <span className={`priority priority-${editSla.priority.toLowerCase()}`}><span className="priority-bar"></span>{editSla.priority}</span></div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setEditSla(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="field"><label className="label">SLA (jam)</label><input type="number" min={1} className="input" value={editSlaForm.targetHours} onChange={e => setEditSlaForm(f => ({ ...f, targetHours: Number(e.target.value) }))} /></div>
              <div className="field"><label className="label">Alert breach (%)</label><input type="number" min={1} max={100} className="input" value={editSlaForm.warningPercent} onChange={e => setEditSlaForm(f => ({ ...f, warningPercent: Number(e.target.value) }))} /></div>
              {editSlaError && <div style={{ fontSize:12, color:'#dc2626', marginTop:4 }}>{editSlaError}</div>}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setEditSla(null)}>Batal</button>
              <button className="btn btn-primary" onClick={handleEditSla}>Simpan</button>
            </div>
          </div>
        </div>
      )}

      {showAdd && (
        <div className="modal-overlay" onClick={() => setShowAdd(false)}>
          <div className="modal" style={{ maxWidth:420 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">Tambah Kategori</div>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowAdd(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="field">
                <label className="label">Nama kategori</label>
                <input className="input" placeholder="Contoh: Infrastructure" value={catForm.name} onChange={e => setCatForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="field">
                <label className="label">Kode (2–6 karakter)</label>
                <input className="input" placeholder="Contoh: INF" maxLength={6} value={catForm.id} onChange={e => setCatForm(f => ({ ...f, id: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'') }))} style={{ fontFamily:'var(--mono)', textTransform:'uppercase' }} />
                <div className="field-hint">Kode unik singkat yang menjadi prefix ID tiket (huruf/angka saja)</div>
              </div>
              {formError && <div style={{ fontSize:12, color:'#dc2626', marginTop:4 }}>{formError}</div>}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowAdd(false)}>Batal</button>
              <button className="btn btn-primary" onClick={handleAdd}>Tambah</button>
            </div>
          </div>
        </div>
      )}
      {confirmState && <ConfirmModal message={confirmState.message} onConfirm={confirmState.onConfirm} onClose={() => setConfirmState(null)} />}
    </div>
  );
}

// ─── IMPORT PENGGUNA ──────────────────────────────────────────────────────────
type ImportRole = 'user' | 'pic';

interface ImportRow {
  email: string;
  name: string;
  dept: string;
  teamId: string;
  role: ImportRole;
  defaultPassword: string;
  status: 'pending' | 'success' | 'error' | 'duplicate';
  errorMsg?: string;
}

function parseCsv(text: string, role: ImportRole): ImportRow[] {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const rows: ImportRow[] = [];
  for (const line of lines.slice(1)) {
    const cols = line.split(',').map(c => c.trim());
    const email = cols[0] ?? '';
    const name  = cols[1] ?? '';
    const third = cols[2] ?? '';
    if (!email || !name) continue;
    const base = name.replace(/\s+/g, '').slice(0, 5);
    rows.push({ email, name, dept: role === 'user' ? third : '', teamId: role === 'pic' ? third : '', role, defaultPassword: `IT@${base}2026`, status: 'pending' });
  }
  return rows;
}

function downloadTemplate(role: ImportRole) {
  const header = role === 'user' ? 'email,nama,departemen' : 'email,nama,team_id';
  const example = role === 'user'
    ? 'budi.santoso@lippo.id,Budi Santoso,Finance'
    : 'reza@lippo.id,Reza Pratama,team-ivan';
  const blob = new Blob([`${header}\n${example}\n`], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `template_import_${role}.csv`; a.click();
  URL.revokeObjectURL(url);
}

const WELCOME_TEMPLATE_USER = (name: string, email: string, password: string) => `
Halo ${name},

Akun IT Helpdesk Anda telah berhasil didaftarkan oleh Administrator.

─────────────────────────
Detail Akun
─────────────────────────
Email    : ${email}
Password : ${password}
Portal   : /login
─────────────────────────

Langkah selanjutnya:
1. Buka portal IT Helpdesk
2. Login dengan email dan password di atas
3. Segera ubah password Anda melalui menu Pengaturan

Jika ada pertanyaan, hubungi tim IT Helpdesk.

Salam,
Tim IT Helpdesk
`.trim();

const WELCOME_TEMPLATE_PIC = (name: string, email: string, password: string) => `
Halo ${name},

Anda telah didaftarkan sebagai PIC (Person In Charge) di sistem IT Helpdesk oleh Administrator.

─────────────────────────
Detail Akun
─────────────────────────
Email    : ${email}
Password : ${password}
Portal   : /pic (PIC Dashboard)
─────────────────────────

Sebagai PIC, Anda akan menerima dan menangani tiket yang masuk dari karyawan.

Langkah selanjutnya:
1. Buka PIC Dashboard
2. Login dengan email dan password di atas
3. Segera ubah password Anda melalui menu Pengaturan

Salam,
Tim IT Helpdesk
`.trim();

function ImportPenggunaPage({ onPicChange }: { onPicChange: () => Promise<void> }) {
  const [activeTab, setActiveTab] = useState<ImportRole>('user');
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [step, setStep] = useState<'upload' | 'preview' | 'done'>('upload');
  const [processing, setProcessing] = useState(false);
  const [previewEmail, setPreviewEmail] = useState<ImportRow | null>(null);
  const fileRef = useState<HTMLInputElement | null>(null);

  const resetState = () => { setRows([]); setStep('upload'); setPreviewEmail(null); };

  const handleTabChange = (role: ImportRole) => { setActiveTab(role); resetState(); };

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = async e => {
      const text = e.target?.result as string;
      const parsed = parseCsv(text, activeTab);
      if (!parsed.length) { alert('File tidak valid atau kosong. Pastikan format CSV sesuai template.'); return; }
      // mark duplicates
      const existing = (await fetchAppUsers()).map(u => u.email.toLowerCase());
      const marked = parsed.map(r => ({
        ...r,
        status: existing.includes(r.email.toLowerCase()) ? 'duplicate' : 'pending',
        errorMsg: existing.includes(r.email.toLowerCase()) ? 'Email sudah terdaftar' : undefined,
      } as ImportRow));
      setRows(marked);
      setStep('preview');
    };
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const runImport = async () => {
    setProcessing(true);
    const toImport = rows.filter(r => r.status === 'pending');
    const updated = [...rows];
    let picCreated = false;

    for (const row of toImport) {
      const idx = updated.findIndex(r => r.email === row.email);
      try {
        if (row.role === 'pic') {
          const initials = row.name.split(/\s+/).map((w: string) => w[0]).join('').toUpperCase().slice(0, 2);
          const picId = `p-dyn-${Date.now()}-${idx}`;
          const result = await adminCreateAccount({
            email: row.email, password: row.defaultPassword, name: row.name,
            role: 'pic', picId, teamId: row.teamId || undefined, initials,
          });
          if (!result.ok) throw new Error(result.error);
          await createPic({ id: picId, name: row.name, email: row.email, initials });
          picCreated = true;
        } else {
          const result = await adminCreateAccount({
            email: row.email, password: row.defaultPassword, name: row.name,
            role: 'user', dept: row.dept || undefined,
          });
          if (!result.ok) throw new Error(result.error);
        }
        // Actually email the credentials; only flag email_sent if it really sent.
        const mail = await sendWelcomeEmail({ toEmail: row.email, toName: row.name, password: row.defaultPassword, role: row.role });
        if (mail.ok) await markAppUserEmailSent(row.email);
        updated[idx] = { ...updated[idx], status: 'success', errorMsg: mail.ok ? undefined : `Akun dibuat, email gagal: ${mail.reason}` };
      } catch (err) {
        updated[idx] = { ...updated[idx], status: 'error', errorMsg: err instanceof Error ? err.message : 'Gagal mendaftarkan' };
      }
    }

    setRows(updated);
    if (picCreated) await onPicChange();
    setProcessing(false);
    setStep('done');
  };

  const successCount = rows.filter(r => r.status === 'success').length;
  const duplicateCount = rows.filter(r => r.status === 'duplicate').length;
  const errorCount = rows.filter(r => r.status === 'error').length;

  return (
    <div>
      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {(['user', 'pic'] as ImportRole[]).map(role => (
          <button
            key={role}
            className={`btn ${activeTab === role ? 'btn-primary' : 'btn-secondary'} btn-sm`}
            onClick={() => handleTabChange(role)}
          >
            {role === 'user' ? '👤 Import User' : '🛠 Import PIC'}
          </button>
        ))}
        <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={() => downloadTemplate(activeTab)}>
          ↓ Download Template CSV
        </button>
      </div>

      {/* Info format */}
      <div style={{ marginBottom: 16, padding: 12, background: 'var(--surface-2)', borderRadius: 6, fontSize: 12, color: 'var(--text-muted)' }}>
        <strong>Format CSV {activeTab === 'user' ? 'User' : 'PIC'}:</strong>{' '}
        {activeTab === 'user'
          ? 'email, nama, departemen'
          : 'email, nama, team_id (contoh: team-ivan / team-nicholas / team-joshua / team-license)'}
        {' '}<span style={{ color: 'var(--status-open)' }}>· Baris pertama = header (diabaikan)</span>
      </div>

      {/* Step: Upload */}
      {step === 'upload' && (
        <div
          onDrop={handleDrop}
          onDragOver={e => e.preventDefault()}
          style={{ border: '2px dashed var(--border)', borderRadius: 8, padding: 48, textAlign: 'center', cursor: 'pointer', background: 'var(--surface)' }}
          onClick={() => document.getElementById('csv-input')?.click()}
        >
          <div style={{ fontSize: 32, marginBottom: 12 }}>📄</div>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Drag & drop file CSV di sini</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>atau klik untuk pilih file</div>
          <button className="btn btn-secondary btn-sm">Pilih File CSV</button>
          <input
            id="csv-input"
            type="file"
            accept=".csv"
            style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
        </div>
      )}

      {/* Step: Preview */}
      {step === 'preview' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontSize: 13 }}>
              <strong>{rows.filter(r => r.status === 'pending').length}</strong> akun siap diimport
              {duplicateCount > 0 && <span style={{ marginLeft: 8, color: 'var(--priority-medium)' }}>· {duplicateCount} duplikat dilewati</span>}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-secondary btn-sm" onClick={resetState}>← Ulang</button>
              <button className="btn btn-primary btn-sm" onClick={runImport} disabled={processing || rows.filter(r => r.status === 'pending').length === 0}>
                {processing ? 'Memproses...' : `Daftarkan & Kirim Email (${rows.filter(r => r.status === 'pending').length})`}
              </button>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Nama</th>
                  <th>{activeTab === 'user' ? 'Departemen' : 'Tim'}</th>
                  <th>Default Password</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td style={{ fontSize: 12 }}>{r.email}</td>
                    <td style={{ fontWeight: 500 }}>{r.name}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{activeTab === 'user' ? r.dept : r.teamId}</td>
                    <td className="mono" style={{ fontSize: 11 }}>{r.defaultPassword}</td>
                    <td>
                      {r.status === 'pending' && <span className="badge status-open"><span className="badge-dot"></span>Siap import</span>}
                      {r.status === 'duplicate' && <span style={{ fontSize: 11, color: 'var(--priority-medium)' }}>⚠ Duplikat</span>}
                    </td>
                    <td>
                      <button className="btn btn-ghost btn-sm" onClick={() => setPreviewEmail(r)} title="Preview email">📧</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Step: Done */}
      {step === 'done' && (
        <div>
          <div style={{ padding: 24, background: 'var(--status-done-bg)', border: '1px solid var(--status-done)', borderRadius: 8, marginBottom: 16, textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>✓</div>
            <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--status-done)', marginBottom: 4 }}>Import selesai</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              {successCount} akun berhasil didaftarkan
              {duplicateCount > 0 && ` · ${duplicateCount} dilewati (duplikat)`}
              {errorCount > 0 && ` · ${errorCount} gagal`}
            </div>
          </div>

          <div style={{ marginBottom: 16, padding: 12, background: 'var(--surface-2)', borderRadius: 6, fontSize: 12, color: 'var(--text-muted)' }}>
            <strong>Catatan:</strong> Akun yang berhasil (✓) sudah terdaftar dan bisa langsung login dengan email + password di tabel ini (password kini diverifikasi via Supabase Auth — tidak lagi bebas).
            Email kredensial dikirim otomatis via EmailJS jika <code>NEXT_PUBLIC_EMAILJS_ENABLED=true</code> dan <code>NEXT_PUBLIC_EMAILJS_WELCOME_TEMPLATE_ID</code> sudah diset; kalau belum, bagikan password manual dari tabel ini.
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <table className="table">
              <thead><tr><th>Email</th><th>Nama</th><th>Default Password</th><th>Status</th></tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td style={{ fontSize: 12 }}>{r.email}</td>
                    <td style={{ fontWeight: 500 }}>{r.name}</td>
                    <td className="mono" style={{ fontSize: 11 }}>{r.defaultPassword}</td>
                    <td>
                      {r.status === 'success' && <span className="badge status-done"><span className="badge-dot"></span>Berhasil · Email dikirim</span>}
                      {r.status === 'duplicate' && <span style={{ fontSize: 11, color: 'var(--priority-medium)' }}>⚠ Duplikat — dilewati</span>}
                      {r.status === 'error' && <span style={{ fontSize: 11, color: '#dc2626' }}>✕ {r.errorMsg}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button className="btn btn-secondary btn-sm" onClick={resetState}>Import lagi</button>
        </div>
      )}

      {/* Email preview modal */}
      {previewEmail && (
        <div className="modal-overlay" onClick={() => setPreviewEmail(null)}>
          <div className="modal" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div className="modal-title">📧 Preview Email Undangan</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>To: {previewEmail.email}</div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setPreviewEmail(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{ background: 'var(--surface-2)', borderRadius: 6, padding: 14, fontSize: 12, lineHeight: 1.8 }}>
                <div style={{ marginBottom: 8 }}>
                  <strong>From:</strong> IT Helpdesk &lt;helpdesk@lippo.id&gt;<br />
                  <strong>To:</strong> {previewEmail.email}<br />
                  <strong>Subject:</strong> {previewEmail.role === 'user'
                    ? 'Akun IT Helpdesk Anda Telah Didaftarkan'
                    : 'Anda Terdaftar sebagai PIC di IT Helpdesk'}
                </div>
                <hr style={{ margin: '8px 0', borderColor: 'var(--border)' }} />
                <pre style={{ fontFamily: 'inherit', whiteSpace: 'pre-wrap', margin: 0 }}>
                  {previewEmail.role === 'user'
                    ? WELCOME_TEMPLATE_USER(previewEmail.name, previewEmail.email, previewEmail.defaultPassword)
                    : WELCOME_TEMPLATE_PIC(previewEmail.name, previewEmail.email, previewEmail.defaultPassword)}
                </pre>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setPreviewEmail(null)}>Tutup</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── USERS ─────────────────────────────────────────────────────────────────────
function UsersPage({ tickets, allPics, onPicChange }: { tickets: Ticket[]; allPics: PIC[]; onPicChange: () => Promise<void> }) {
  const [showAddPIC, setShowAddPIC] = useState(false);
  const [picForm, setPicForm] = useState({ name: '', email: '', password: '' });
  const [formError, setFormError] = useState('');
  const [editPic, setEditPic] = useState<PIC | null>(null);
  const [editPicForm, setEditPicForm] = useState({ name: '', email: '', newPassword: '' });
  const [editPicError, setEditPicError] = useState('');
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [showAddUser, setShowAddUser] = useState(false);
  const [userForm, setUserForm] = useState({ name: '', email: '', dept: '', password: '' });
  const [userFormError, setUserFormError] = useState('');
  const [userProfiles, setUserProfiles] = useState<UserProfile[]>([]);

  const refreshUserProfiles = async () => {
    try { setUserProfiles(await fetchUserProfiles()); } catch { /* ignore */ }
  };
  useEffect(() => { refreshUserProfiles(); }, []);

  const defaultPwd = (name: string) => {
    const base = name.trim().replace(/\s+/g, '').slice(0, 5);
    return `IT@${base}2026`;
  };

  const handleAddPIC = async () => {
    const name = picForm.name.trim();
    const email = picForm.email.trim();
    const password = picForm.password.trim() || defaultPwd(name);
    if (!name) { setFormError('Nama wajib diisi.'); return; }
    if (!email || !email.includes('@')) { setFormError('Email tidak valid.'); return; }
    if (password.length < 6) { setFormError('Password minimal 6 karakter.'); return; }
    if (allPics.some(p => p.email.toLowerCase() === email.toLowerCase())) { setFormError('Email sudah terdaftar.'); return; }
    const initials = name.split(/\s+/).map((w: string) => w[0]).join('').toUpperCase().slice(0, 2);
    const picId = `p-dyn-${Date.now()}`;
    const result = await adminCreateAccount({ email, password, name, role: 'pic', picId, initials });
    if (!result.ok) { setFormError(result.error); return; }
    try {
      await createPic({ id: picId, name, email, initials });
      await onPicChange();
      const mail = await sendWelcomeEmail({ toEmail: email, toName: name, password, role: 'pic' });
      if (!mail.ok) alert(`Akun PIC dibuat & bisa langsung login. Tapi email kredensial gagal terkirim (${mail.reason}).\n\nBagikan manual ke ${email}\nPassword: ${password}`);
      setShowAddPIC(false);
      setPicForm({ name: '', email: '', password: '' });
      setFormError('');
    } catch {
      setFormError('Akun login berhasil dibuat, tapi gagal menyimpan data PIC. Coba lagi atau hubungi developer.');
    }
  };

  const handleAddUser = async () => {
    const name = userForm.name.trim();
    const email = userForm.email.trim();
    const dept = userForm.dept.trim();
    const password = userForm.password.trim() || defaultPwd(name);
    if (!name) { setUserFormError('Nama wajib diisi.'); return; }
    if (!email || !email.includes('@')) { setUserFormError('Email tidak valid.'); return; }
    if (password.length < 6) { setUserFormError('Password minimal 6 karakter.'); return; }
    const result = await adminCreateAccount({ email, password, name, role: 'user', dept });
    if (!result.ok) { setUserFormError(result.error); return; }
    await refreshUserProfiles();
    const mail = await sendWelcomeEmail({ toEmail: email, toName: name, password, role: 'user' });
    if (!mail.ok) alert(`Akun dibuat & bisa langsung login. Tapi email kredensial gagal terkirim (${mail.reason}).\n\nBagikan manual ke ${email}\nPassword: ${password}`);
    setShowAddUser(false);
    setUserForm({ name: '', email: '', dept: '', password: '' });
    setUserFormError('');
  };

  const openEditPic = (p: PIC) => {
    setEditPic(p);
    setEditPicForm({ name: p.name, email: p.email, newPassword: '' });
    setEditPicError('');
  };

  const handleEditPic = async () => {
    if (!editPic) return;
    const name = editPicForm.name.trim();
    const email = editPicForm.email.trim();
    if (!name) { setEditPicError('Nama wajib diisi.'); return; }
    if (!email || !email.includes('@')) { setEditPicError('Email tidak valid.'); return; }
    if (editPicForm.newPassword && editPicForm.newPassword.length < 6) { setEditPicError('Password baru minimal 6 karakter.'); return; }
    if (email !== editPic.email && allPics.some(p => p.email.toLowerCase() === email.toLowerCase())) {
      setEditPicError('Email sudah dipakai PIC lain.'); return;
    }
    const initials = name.split(/\s+/).map((w: string) => w[0]).join('').toUpperCase().slice(0, 2);
    const result = await adminUpdateAccount({
      email: editPic.email,
      newEmail: email !== editPic.email ? email : undefined,
      newPassword: editPicForm.newPassword || undefined,
      name,
    });
    if (!result.ok) { setEditPicError(result.error); return; }
    try {
      await updatePic(editPic.id, { name, email, initials });
      await onPicChange();
      setEditPic(null);
    } catch {
      setEditPicError('Akun login berhasil diperbarui, tapi gagal menyimpan data PIC. Coba lagi.');
    }
  };

  const handleDeletePIC = (id: string, name: string) => {
    setConfirmState({
      message: `Hapus PIC "${name}" dari sistem?`,
      onConfirm: async () => {
        await deactivatePic(id);
        await onPicChange();
      },
    });
  };

  return (
    <div>
      {/* ── PIC ── */}
      <div className="card" style={{ marginBottom:16 }}>
        <div className="card-header" style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div><div className="card-title">Tim IT (PIC)</div><div className="card-subtitle">{allPics.length} orang</div></div>
          <button className="btn btn-primary btn-sm" onClick={() => { setShowAddPIC(true); setFormError(''); }}>+ Tambah PIC</button>
        </div>
        <table className="table">
          <thead><tr><th>Nama</th><th>Email</th><th>Tiket aktif</th><th style={{ width:140 }}>Aksi</th></tr></thead>
          <tbody>
            {allPics.map(p => (
              <tr key={p.id}>
                <td><div style={{ display:'flex', alignItems:'center', gap:10 }}><div className="user-avatar" style={{ width:28, height:28 }}>{p.initials}</div><span style={{ fontWeight:500 }}>{p.name}</span></div></td>
                <td style={{ fontSize:13, color:'var(--text-muted)' }}>{p.email}</td>
                <td className="mono" style={{ fontSize:12 }}>{tickets.filter(t => t.assignedToId === p.id && ['Open','In Progress','Pending'].includes(t.status)).length}</td>
                <td>
                  <div style={{ display:'flex', gap:4 }}>
                    <button className="btn btn-secondary btn-sm" title="Edit PIC" onClick={() => openEditPic(p)}><PencilIcon />Edit</button>
                    <button className="btn btn-ghost btn-sm" style={{ color:'#dc2626' }} title="Hapus PIC" onClick={() => handleDeletePIC(p.id, p.name)}><TrashIcon />Hapus</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Karyawan / User ── */}
      <div className="card">
        <div className="card-header" style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div><div className="card-title">Karyawan Terdaftar</div><div className="card-subtitle">User yang bisa submit tiket · {userProfiles.length} akun</div></div>
          <button className="btn btn-primary btn-sm" onClick={() => { setShowAddUser(true); setUserFormError(''); }}>+ Tambah User</button>
        </div>
        <table className="table">
          <thead><tr><th>Nama</th><th>Email</th><th>Departemen</th><th>Tiket total</th><th style={{ width:80 }}>Aksi</th></tr></thead>
          <tbody>
            {userProfiles.map(u => (
              <tr key={u.email}>
                <td style={{ fontWeight:500 }}>{u.name}</td>
                <td style={{ fontSize:13, color:'var(--text-muted)' }}>{u.email}</td>
                <td style={{ fontSize:13 }}>{u.dept ?? '—'}</td>
                <td className="mono" style={{ fontSize:12 }}>{tickets.filter(t => t.from === u.email).length}</td>
                <td>
                  {!SEED_ACCOUNTS.some(a => a.email.toLowerCase() === u.email.toLowerCase()) && (
                    <button className="btn btn-ghost btn-sm" style={{ color:'#dc2626' }} onClick={() => setConfirmState({ message:`Hapus akun "${u.name}"?`, onConfirm: async () => { const r = await adminDeleteAccount(u.email); if (r.ok) await refreshUserProfiles(); } })}><TrashIcon />Hapus</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal Edit PIC */}
      {editPic && (
        <div className="modal-overlay" onClick={() => setEditPic(null)}>
          <div className="modal" style={{ maxWidth:420 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div className="modal-title">Edit PIC</div>
                <div style={{ fontSize:12, color:'var(--text-muted)', marginTop:2 }}>{editPic.name}</div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setEditPic(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="field">
                <label className="label">Nama lengkap</label>
                <input className="input" value={editPicForm.name} onChange={e => setEditPicForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="field">
                <label className="label">Email</label>
                <input className="input" type="email" value={editPicForm.email} onChange={e => setEditPicForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div className="field">
                <label className="label">Ganti Password <span style={{ fontWeight:400, color:'var(--text-muted)' }}>(kosongkan jika tidak diubah)</span></label>
                <input className="input" type="text" placeholder="Password baru..." value={editPicForm.newPassword} onChange={e => setEditPicForm(f => ({ ...f, newPassword: e.target.value }))} />
              </div>
              {editPicError && <div style={{ fontSize:12, color:'#dc2626', marginTop:4 }}>{editPicError}</div>}
            </div>
            <div className="modal-footer" style={{ justifyContent:'space-between' }}>
              <button className="btn btn-ghost btn-sm" style={{ color:'#dc2626' }} onClick={() => {
                setConfirmState({
                  message: `Hapus PIC "${editPic.name}" dari sistem?`,
                  onConfirm: async () => {
                    await deactivatePic(editPic.id);
                    await onPicChange();
                    setEditPic(null);
                  },
                });
              }}><TrashIcon />Hapus</button>
              <div style={{ display:'flex', gap:8 }}>
                <button className="btn btn-secondary" onClick={() => setEditPic(null)}>Batal</button>
                <button className="btn btn-primary" onClick={handleEditPic}>Simpan</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Tambah PIC */}
      {showAddPIC && (
        <div className="modal-overlay" onClick={() => setShowAddPIC(false)}>
          <div className="modal" style={{ maxWidth:420 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">Tambah PIC</div>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowAddPIC(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="field">
                <label className="label">Nama lengkap</label>
                <input className="input" placeholder="Contoh: Reza Pratama" value={picForm.name} onChange={e => setPicForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="field">
                <label className="label">Email</label>
                <input className="input" type="email" placeholder="reza.pratama@lippo.id" value={picForm.email} onChange={e => setPicForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div className="field">
                <label className="label">Password <span style={{ fontWeight:400, color:'var(--text-muted)' }}>(opsional — auto-generate jika kosong)</span></label>
                <input className="input" type="text" placeholder={picForm.name ? defaultPwd(picForm.name) : 'IT@Nama2026'} value={picForm.password} onChange={e => setPicForm(f => ({ ...f, password: e.target.value }))} />
                {!picForm.password && picForm.name && <div className="field-hint">Akan dibuat: <strong>{defaultPwd(picForm.name)}</strong></div>}
              </div>
              {formError && <div style={{ fontSize:12, color:'#dc2626', marginTop:4 }}>{formError}</div>}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowAddPIC(false)}>Batal</button>
              <button className="btn btn-primary" onClick={handleAddPIC}>Tambah</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Tambah User */}
      {showAddUser && (
        <div className="modal-overlay" onClick={() => setShowAddUser(false)}>
          <div className="modal" style={{ maxWidth:420 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">Tambah User</div>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowAddUser(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="field">
                <label className="label">Nama lengkap</label>
                <input className="input" placeholder="Contoh: Budi Santoso" value={userForm.name} onChange={e => setUserForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="field">
                <label className="label">Email</label>
                <input className="input" type="email" placeholder="budi.santoso@lippo.id" value={userForm.email} onChange={e => setUserForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div className="field">
                <label className="label">Departemen</label>
                <input className="input" placeholder="Contoh: Finance" value={userForm.dept} onChange={e => setUserForm(f => ({ ...f, dept: e.target.value }))} />
              </div>
              <div className="field">
                <label className="label">Password <span style={{ fontWeight:400, color:'var(--text-muted)' }}>(opsional — auto-generate jika kosong)</span></label>
                <input className="input" type="text" placeholder={userForm.name ? defaultPwd(userForm.name) : 'IT@Nama2026'} value={userForm.password} onChange={e => setUserForm(f => ({ ...f, password: e.target.value }))} />
                {!userForm.password && userForm.name && <div className="field-hint">Akan dibuat: <strong>{defaultPwd(userForm.name)}</strong></div>}
              </div>
              {userFormError && <div style={{ fontSize:12, color:'#dc2626', marginTop:4 }}>{userFormError}</div>}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowAddUser(false)}>Batal</button>
              <button className="btn btn-primary" onClick={handleAddUser}>Tambah</button>
            </div>
          </div>
        </div>
      )}

      {confirmState && <ConfirmModal message={confirmState.message} onConfirm={confirmState.onConfirm} onClose={() => setConfirmState(null)} />}
    </div>
  );
}

// ─── CUTOFF ────────────────────────────────────────────────────────────────────
function CutoffPage({ tickets, setTickets }: { tickets: Ticket[]; setTickets: React.Dispatch<React.SetStateAction<Ticket[]>> }) {
  const [cutoffDone, setCutoffDone] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const cutoffDate = new Date().toLocaleString('id-ID', { day:'2-digit', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit' });
  const STATUS_META = [{ status:'Open',color:'#2563eb' },{ status:'In Progress',color:'#d97706' },{ status:'Pending',color:'#7c3aed' },{ status:'Revisi',color:'#c2410c' },{ status:'Done',color:'#16a34a' },{ status:'Closed',color:'#525252' }];
  const summary = STATUS_META.map(s => ({ ...s, count: tickets.filter(t => t.status === s.status).length }));
  const doneCount = tickets.filter(t => t.status === 'Done').length;

  const executeCutoff = () => {
    const now = new Date().toISOString();
    const toClose = tickets.filter(t => t.status === 'Done');
    setTickets(prev => prev.map(t => t.status==='Done' ? { ...t, status:'Closed' as const, updatedAt:now, activity:[...(t.activity||[]),{ type:'system' as const,time:now,text:'Status: Done → Closed (Cutoff by Admin)' }] } : t));
    setCutoffDone(true);
    setShowConfirm(false);
    toClose.forEach(t => {
      updateTicketFields(t.id, { status: 'Closed', updatedAt: now, activity: [...(t.activity||[]), { type:'system', time:now, text:'Status: Done → Closed (Cutoff by Admin)' }] });
    });
  };

  return (
    <div>
      <div className="cutoff-print-header" style={{ display:'none' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end', marginBottom:10 }}>
          <div><div style={{ fontSize:9, fontWeight:700, letterSpacing:'0.12em', textTransform:'uppercase', color:'#888', marginBottom:3 }}>IT Helpdesk</div><div style={{ fontSize:20, fontWeight:700, color:'#111' }}>Rekap Tiket — Cutoff</div></div>
          <div style={{ textAlign:'right', fontSize:11, color:'#555', lineHeight:1.6 }}><div>Tanggal: <strong>{cutoffDate}</strong></div><div>Total tiket: <strong>{tickets.length}</strong></div></div>
        </div>
        <hr style={{ margin:'0 0 16px', borderColor:'#222', borderWidth:'1.5px 0 0' }} />
      </div>
      <div className="no-print" style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
        <div>
          <div style={{ fontWeight:600, fontSize:15, marginBottom:2 }}>Rekap Tiket per {cutoffDate}</div>
          <div style={{ fontSize:12, color:'var(--text-muted)' }}>{doneCount} tiket berstatus <strong>Done</strong> akan berubah jadi <strong>Closed</strong> saat cutoff dieksekusi.</div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => window.print()}>Export PDF</button>
          {!cutoffDone ? (
            <button className="btn btn-primary btn-sm" onClick={() => setShowConfirm(true)} disabled={doneCount===0}>Eksekusi Cutoff {doneCount>0?`(${doneCount} Done → Closed)`:''}</button>
          ) : (
            <span style={{ fontSize:12, color:'var(--status-done)', fontWeight:600, padding:'6px 12px', background:'var(--status-done-bg)', borderRadius:6 }}>Cutoff selesai</span>
          )}
        </div>
      </div>
      <div className="stat-grid" style={{ marginBottom:20 }}>
        {summary.map(s => (
          <div key={s.status} className="stat" style={{ borderTop:`3px solid ${s.color}` }}>
            <div className="stat-label">{s.status}</div>
            <div className="stat-value" style={{ color:s.color }}>{s.count}</div>
            {s.status==='Done' && !cutoffDone && s.count>0 && <div className="stat-trend" style={{ color:s.color }}>Akan → Closed</div>}
          </div>
        ))}
      </div>
      <div className="card">
        <div className="card-header"><div className="card-title">Semua Tiket ({tickets.length})</div><div className="card-subtitle">Rekap lengkap untuk semua status</div></div>
        <table className="table">
          <thead><tr><th>ID</th><th>Subject</th><th>User</th><th>Kategori</th><th>Priority</th><th>Status</th><th>PIC</th><th>Tanggal</th></tr></thead>
          <tbody>
            {tickets.map(t => (
              <tr key={t.id}>
                <td className="mono" style={{ fontSize:11, color:'var(--text-muted)' }}>{t.id}</td>
                <td style={{ fontWeight:500 }}>{t.subject}</td>
                <td style={{ fontSize:12 }}>{t.fromName}</td>
                <td style={{ fontSize:12 }}>{t.category}</td>
                <td><span className={`priority priority-${t.priority.toLowerCase()}`}><span className="priority-bar"></span>{t.priority}</span></td>
                <td style={{ whiteSpace:'nowrap' }}><span className={`badge ${statusClass(t.status)}`}><span className="badge-dot"></span>{t.status}</span></td>
                <td style={{ fontSize:12 }}>{t.assignedName}</td>
                <td style={{ fontSize:12, color:'var(--text-muted)' }}>{formatDate(t.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {showConfirm && (
        <div className="modal-overlay" onClick={() => setShowConfirm(false)}>
          <div className="modal" style={{ maxWidth:460 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header"><div className="modal-title">Konfirmasi Eksekusi Cutoff</div><button className="btn btn-ghost btn-sm" onClick={() => setShowConfirm(false)}>✕</button></div>
            <div className="modal-body">
              <p style={{ fontSize:13, lineHeight:1.6 }}>Eksekusi cutoff akan mengubah status <strong>{doneCount} tiket Done</strong> menjadi <strong>Closed</strong>. Tindakan ini tidak dapat dibatalkan dalam sesi ini.</p>
              <div style={{ marginTop:16, padding:12, background:'var(--surface-2)', borderRadius:6, fontSize:12, color:'var(--text-muted)' }}>Tanggal rekap: <strong>{cutoffDate}</strong></div>
            </div>
            <div className="modal-footer"><button className="btn btn-secondary" onClick={() => setShowConfirm(false)}>Batal</button><button className="btn btn-primary" onClick={executeCutoff}>Ya, Eksekusi Cutoff</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── APLIKASI ─────────────────────────────────────────────────────────────────
function AplikasiPage({
  allApps, allCategories, onAppChange,
}: {
  allApps: App[]; allCategories: Category[]; onAppChange: () => Promise<void>;
}) {
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', prefix: '' });
  const [formError, setFormError] = useState('');
  const [page, setPage] = useState(1);
  const [editTarget, setEditTarget] = useState<App | null>(null);
  const [editForm, setEditForm] = useState({ name: '', prefix: '' });
  const [editError, setEditError] = useState('');
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

  useEffect(() => { setPage(1); }, [search]);

  const allAppNames = allApps.map(a => a.name.toLowerCase());

  const filtered = allApps.filter(a =>
    !search ||
    a.name.toLowerCase().includes(search.toLowerCase()) ||
    a.prefix.toLowerCase().includes(search.toLowerCase())
  );
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleAdd = async () => {
    const name = form.name.trim();
    const prefix = form.prefix.toUpperCase();
    if (!name) { setFormError('Nama aplikasi wajib diisi.'); return; }
    if (!prefix) { setFormError('Kategori / prefix wajib dipilih.'); return; }
    const fullName = `[${prefix}] - ${name}`;
    if (allAppNames.includes(fullName.toLowerCase())) {
      setFormError('Aplikasi dengan nama ini sudah ada.'); return;
    }
    try {
      await createApp({ name: fullName, prefix, keywords: [name.toLowerCase()] });
      await onAppChange();
      setShowAdd(false);
      setForm({ name: '', prefix: '' });
      setFormError('');
    } catch {
      setFormError('Gagal menyimpan aplikasi. Coba lagi.');
    }
  };

  const openEdit = (app: App) => {
    const namePart = app.name.replace(/^\[[A-Z0-9]+\] - /, '');
    setEditForm({ name: namePart, prefix: app.prefix });
    setEditError('');
    setEditTarget(app);
  };

  const handleEdit = async () => {
    if (!editTarget?.id) return;
    const name = editForm.name.trim();
    const prefix = editForm.prefix.toUpperCase();
    if (!name) { setEditError('Nama aplikasi wajib diisi.'); return; }
    if (!prefix) { setEditError('Kategori / prefix wajib dipilih.'); return; }
    const fullName = `[${prefix}] - ${name}`;
    if (fullName !== editTarget.name && allAppNames.includes(fullName.toLowerCase())) {
      setEditError('Aplikasi dengan nama ini sudah ada.'); return;
    }
    try {
      await updateApp(editTarget.id, { name: fullName, prefix });
      await onAppChange();
      setEditTarget(null);
    } catch {
      setEditError('Gagal menyimpan perubahan. Coba lagi.');
    }
  };

  const handleDelete = (app: App) => {
    if (!app.id) return;
    setConfirmState({
      message: `Hapus aplikasi "${app.name}"?`,
      onConfirm: async () => { await deleteApp(app.id!); await onAppChange(); },
    });
  };

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          {allApps.length} aplikasi terdaftar
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className="filter-input"
            placeholder="Cari nama atau kategori..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: 240 }}
          />
          <button className="btn btn-primary btn-sm" onClick={() => { setShowAdd(true); setFormError(''); }}>+ Tambah Aplikasi</button>
        </div>
      </div>

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Nama Aplikasi</th>
              <th>Kategori</th>
              <th style={{ width: 140 }}>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {paginated.map(app => (
              <tr key={app.id ?? app.name}>
                <td style={{ fontWeight: 500 }}>{app.name}</td>
                <td>
                  <span style={{ fontSize: 11, padding: '2px 6px', background: 'var(--surface-2)', borderRadius: 4, fontFamily: 'var(--mono)' }}>
                    {app.prefix}
                  </span>
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button className="btn btn-secondary btn-sm" title="Edit aplikasi" onClick={() => openEdit(app)}>
                      <PencilIcon />Edit
                    </button>
                    <button className="btn btn-ghost btn-sm" style={{ color: '#dc2626' }} title="Hapus aplikasi" onClick={() => handleDelete(app)}>
                      <TrashIcon />Hapus
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {paginated.length === 0 && (
              <tr><td colSpan={3} style={{ textAlign: 'center', color: 'var(--text-subtle)', fontSize: 13 }}>Tidak ada aplikasi ditemukan</td></tr>
            )}
          </tbody>
        </table>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {filtered.length === 0 ? 'Tidak ada hasil' : `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, filtered.length)} dari ${filtered.length} aplikasi`}
          </div>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <button className="btn btn-secondary btn-sm" disabled={page === 1} onClick={() => setPage(p => p - 1)} style={{ minWidth: 32 }}>‹</button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
              <button key={p} className={`btn btn-sm ${p === page ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setPage(p)} style={{ minWidth: 32 }}>{p}</button>
            ))}
            <button className="btn btn-secondary btn-sm" disabled={page === totalPages || totalPages === 0} onClick={() => setPage(p => p + 1)} style={{ minWidth: 32 }}>›</button>
          </div>
        </div>
      </div>

      {/* Modal Tambah */}
      {showAdd && (
        <div className="modal-overlay" onClick={() => setShowAdd(false)}>
          <div className="modal" style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">Tambah Aplikasi Baru</div>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowAdd(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="field">
                <label className="label">Kategori / Prefix</label>
                <select className="input" value={form.prefix} onChange={e => setForm(f => ({ ...f, prefix: e.target.value }))}>
                  <option value="">— Pilih Kategori —</option>
                  {allCategories.map(c => <option key={c.id} value={c.id}>{c.id} — {c.name}</option>)}
                </select>
              </div>
              <div className="field">
                <label className="label">Nama Aplikasi</label>
                <input
                  className="input"
                  placeholder="Contoh: Budget System"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                />
                {form.name.trim() && form.prefix && (
                  <div className="field-hint">Disimpan sebagai: <strong>[{form.prefix.toUpperCase()}] - {form.name.trim()}</strong></div>
                )}
              </div>
              {formError && <div style={{ fontSize: 12, color: '#dc2626', marginTop: 4 }}>{formError}</div>}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowAdd(false)}>Batal</button>
              <button className="btn btn-primary" onClick={handleAdd}>Tambah</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Edit */}
      {editTarget && (
        <div className="modal-overlay" onClick={() => setEditTarget(null)}>
          <div className="modal" style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div className="modal-title">Edit Aplikasi</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{editTarget.name}</div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setEditTarget(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="field">
                <label className="label">Kategori / Prefix</label>
                <select className="input" value={editForm.prefix} onChange={e => setEditForm(f => ({ ...f, prefix: e.target.value }))}>
                  <option value="">— Pilih Kategori —</option>
                  {allCategories.map(c => <option key={c.id} value={c.id}>{c.id} — {c.name}</option>)}
                </select>
              </div>
              <div className="field">
                <label className="label">Nama Aplikasi</label>
                <input
                  className="input"
                  value={editForm.name}
                  onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                />
                {editForm.name.trim() && editForm.prefix && (
                  <div className="field-hint">Akan disimpan sebagai: <strong>[{editForm.prefix.toUpperCase()}] - {editForm.name.trim()}</strong></div>
                )}
              </div>
              {editError && <div style={{ fontSize: 12, color: '#dc2626', marginTop: 4 }}>{editError}</div>}
            </div>
            <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
              <button className="btn btn-ghost btn-sm" style={{ color: '#dc2626' }} onClick={() => {
                setConfirmState({
                  message: `Hapus aplikasi "${editTarget.name}"?`,
                  onConfirm: async () => {
                    if (editTarget.id) await deleteApp(editTarget.id);
                    await onAppChange(); setEditTarget(null);
                  },
                });
              }}><TrashIcon />Hapus</button>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-secondary" onClick={() => setEditTarget(null)}>Batal</button>
                <button className="btn btn-primary" onClick={handleEdit}>Simpan</button>
              </div>
            </div>
          </div>
        </div>
      )}
      {confirmState && <ConfirmModal message={confirmState.message} onConfirm={confirmState.onConfirm} onClose={() => setConfirmState(null)} />}
    </div>
  );
}

// ─── WEEKLY REPORT ─────────────────────────────────────────────────────────────
function WeeklyReportPage({ tickets, allPics }: { tickets: Ticket[]; allPics: PIC[] }) {
  const getMonday = () => {
    const d = new Date();
    const day = d.getDay();
    const monday = new Date(d);
    monday.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
    return monday.toISOString().slice(0, 10);
  };

  const [startDate, setStartDate] = useState(getMonday);
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));

  const filtered = tickets.filter(t => {
    const d = t.createdAt.slice(0, 10);
    return d >= startDate && d <= endDate;
  });

  const total   = filtered.length;
  const closed  = filtered.filter(t => ['Done','Closed'].includes(t.status)).length;
  const open    = filtered.filter(t => ['Open','In Progress'].includes(t.status)).length;
  const waiting = filtered.filter(t => ['Pending','Revisi'].includes(t.status)).length;
  const closureRate = total > 0 ? Math.round((closed / total) * 100) : 0;

  const getDayRange = (start: string, end: string) => {
    const days: string[] = [];
    const cur = new Date(start + 'T12:00:00');
    const last = new Date(end + 'T12:00:00');
    while (cur <= last) { days.push(cur.toISOString().slice(0, 10)); cur.setDate(cur.getDate() + 1); }
    return days;
  };
  const days = getDayRange(startDate, endDate);
  const volumePerDay = days.map(d => ({
    date: d,
    label: new Date(d + 'T12:00:00').toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric' }),
    count: filtered.filter(t => t.createdAt.slice(0, 10) === d).length,
  }));
  const maxDayCount = Math.max(...volumePerDay.map(d => d.count), 1);

  const picMap: Record<string, { name: string; count: number }> = {};
  for (const t of filtered) {
    const key = t.assignedToId || 'unassigned';
    if (!picMap[key]) picMap[key] = { name: t.assignedName || 'Unassigned', count: 0 };
    picMap[key].count++;
  }
  const picRanked = Object.values(picMap).sort((a, b) => b.count - a.count);
  const maxPicCount = Math.max(...picRanked.map(p => p.count), 1);

  const appMap: Record<string, number> = {};
  for (const t of filtered) { if (t.app) appMap[t.app] = (appMap[t.app] || 0) + 1; }
  const appRanked = Object.entries(appMap).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const maxAppCount = Math.max(...appRanked.map(a => a[1]), 1);

  const taskMap: Record<string, number> = {};
  for (const t of filtered) {
    const key = t.specificTask || 'Tidak dikategorikan';
    taskMap[key] = (taskMap[key] || 0) + 1;
  }
  const taskRanked = Object.entries(taskMap).sort((a, b) => b[1] - a[1]);

  const agingTickets = filtered
    .filter(t => ['Open','In Progress','Pending','Revisi'].includes(t.status))
    .map(t => ({ ...t, ageDays: Math.floor((Date.now() - new Date(t.createdAt).getTime()) / 86400000) }))
    .sort((a, b) => b.ageDays - a.ageDays);

  const busiest = volumePerDay.length > 0 ? volumePerDay.reduce((a, b) => b.count > a.count ? b : a) : null;
  const topApp  = appRanked[0] ?? null;
  const longAgingCount = agingTickets.filter(t => t.ageDays >= 4).length;

  const [pptLoading, setPptLoading] = useState(false);

  const exportPPT = async () => {
    setPptLoading(true);
    try {
      const payload = {
        startDate, endDate, total, closed, open, waiting, closureRate,
        days,
        volumePerDay,
        picRanked,
        appRanked,
        taskRanked,
        agingTickets: agingTickets.map(t => ({
          id: t.id, subject: t.subject,
          assignedName: t.assignedName, status: t.status, ageDays: t.ageDays,
        })),
        busiest,
        topApp,
        longAgingCount,
      };
      const res = await fetch('/api/export-ppt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Export gagal');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `IT_Helpdesk_Weekly_${startDate}_${endDate}.pptx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      alert('Gagal membuat file PPT. Coba lagi.');
    } finally {
      setPptLoading(false);
    }
  };

  return (
    <div>
      {/* Filter bar */}
      <div className="no-print" style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20, flexWrap:'wrap', gap:12 }}>
        <div>
          <div style={{ fontWeight:600, fontSize:15, marginBottom:2 }}>Laporan Mingguan IT Support</div>
          <div style={{ fontSize:12, color:'var(--text-muted)' }}>Dihitung otomatis dari data tiket sistem</div>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
          <input type="date" className="input" style={{ width:140 }} value={startDate} onChange={e => setStartDate(e.target.value)} />
          <span style={{ fontSize:12, color:'var(--text-muted)' }}>s/d</span>
          <input type="date" className="input" style={{ width:140 }} value={endDate} onChange={e => setEndDate(e.target.value)} />
          <button className="btn btn-secondary btn-sm" onClick={exportPPT} disabled={pptLoading}>
            {pptLoading ? 'Membuat PPT…' : 'Export PPT'}
          </button>
        </div>
      </div>

      {/* Print header */}
      <div className="cutoff-print-header" style={{ display:'none' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end', marginBottom:10 }}>
          <div>
            <div style={{ fontSize:9, fontWeight:700, letterSpacing:'0.12em', textTransform:'uppercase', color:'#888', marginBottom:3 }}>IT Helpdesk · PT Lippo Karawaci Tbk.</div>
            <div style={{ fontSize:20, fontWeight:700, color:'#111' }}>Weekly IT Support Summary</div>
          </div>
          <div style={{ textAlign:'right', fontSize:11, color:'#555', lineHeight:1.6 }}>
            <div>Periode: <strong>{startDate} – {endDate}</strong></div>
            <div>Total tiket: <strong>{total}</strong></div>
          </div>
        </div>
        <hr style={{ margin:'0 0 16px', borderColor:'#222', borderWidth:'1.5px 0 0' }} />
      </div>

      {/* KPI cards */}
      <div className="stat-grid" style={{ marginBottom:16 }}>
        <div className="stat"><div className="stat-label">Total Tiket</div><div className="stat-value">{total}</div><div className="stat-trend">Periode dipilih</div></div>
        <div className="stat" style={{ borderTop:'3px solid #16a34a' }}><div className="stat-label">Closed</div><div className="stat-value" style={{ color:'#16a34a' }}>{closed}</div><div className="stat-trend">Done + Closed</div></div>
        <div className="stat" style={{ borderTop:'3px solid #2563eb' }}><div className="stat-label">Open</div><div className="stat-value" style={{ color:'#2563eb' }}>{open}</div><div className="stat-trend">Open + In Progress</div></div>
        <div className="stat" style={{ borderTop:'3px solid #7c3aed' }}><div className="stat-label">Waiting</div><div className="stat-value" style={{ color:'#7c3aed' }}>{waiting}</div><div className="stat-trend">Pending + Revisi</div></div>
        <div className="stat" style={{ borderTop:'3px solid var(--accent)' }}>
          <div className="stat-label">Closure Rate</div>
          <div className="stat-value">{closureRate}<span style={{ fontSize:16, color:'var(--text-muted)' }}>%</span></div>
          <div className={`stat-trend ${closureRate >= 70 ? 'up' : 'down'}`}>{closureRate >= 70 ? '✓ Target 70% tercapai' : 'Target: 70%'}</div>
        </div>
      </div>

      {/* Volume per hari + Status */}
      <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:16, marginBottom:16 }}>
        <div className="card">
          <div className="card-header"><div className="card-title">Volume Tiket per Hari</div><div className="card-subtitle">Total {total} tiket · {days.length} hari</div></div>
          <div className="card-body">
            <div style={{ display:'flex', alignItems:'flex-end', gap:6, height:160, paddingTop:16 }}>
              {volumePerDay.map((d, i) => (
                <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:4, minWidth:0 }}>
                  <div style={{ fontSize:10, color:'var(--text-muted)', fontWeight:500, minHeight:14 }}>{d.count > 0 ? d.count : ''}</div>
                  <div style={{ width:'100%', height:`${Math.max((d.count / maxDayCount) * 120, d.count > 0 ? 4 : 0)}px`, background: d.count > 0 ? 'var(--accent)' : 'var(--surface-2)', borderRadius:'4px 4px 0 0' }}></div>
                  <div style={{ fontSize:9, color:'var(--text-muted)', textAlign:'center', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:'100%' }}>{d.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header"><div className="card-title">Distribusi Status</div><div className="card-subtitle">Dari {total} tiket</div></div>
          <div className="card-body">
            {total === 0 ? (
              <div style={{ fontSize:13, color:'var(--text-muted)', padding:'20px 0' }}>Tidak ada tiket dalam periode ini</div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                {[
                  { label:'Closed', count:closed, color:'#16a34a' },
                  { label:'Open', count:open, color:'#2563eb' },
                  { label:'Waiting', count:waiting, color:'#7c3aed' },
                ].map(s => (
                  <div key={s.label}>
                    <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:4 }}>
                      <span style={{ fontWeight:500, color:s.color }}>{s.label}</span>
                      <span className="mono" style={{ color:'var(--text-muted)' }}>{s.count} ({Math.round(s.count / total * 100)}%)</span>
                    </div>
                    <div style={{ height:8, background:'var(--surface-2)', borderRadius:4, overflow:'hidden' }}>
                      <div style={{ width:`${(s.count / total) * 100}%`, height:'100%', background:s.color, borderRadius:4 }}></div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* PIC + Top Apps */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:16 }}>
        <div className="card">
          <div className="card-header"><div className="card-title">Distribusi Tiket per PIC</div><div className="card-subtitle">{picRanked.length} PIC dalam periode ini</div></div>
          <div className="card-body">
            {picRanked.length === 0
              ? <div style={{ fontSize:13, color:'var(--text-muted)' }}>Tidak ada data</div>
              : <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                  {picRanked.map((p, i) => (
                    <div key={i}>
                      <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:4 }}>
                        <span style={{ fontWeight:500 }}>{p.name}</span>
                        <span className="mono" style={{ color:'var(--text-muted)' }}>{p.count} tiket ({Math.round(p.count / total * 100)}%)</span>
                      </div>
                      <div style={{ height:6, background:'var(--surface-2)', borderRadius:3, overflow:'hidden' }}>
                        <div style={{ width:`${(p.count / maxPicCount) * 100}%`, height:'100%', background:'var(--accent)', borderRadius:3 }}></div>
                      </div>
                    </div>
                  ))}
                </div>
            }
          </div>
        </div>

        <div className="card">
          <div className="card-header"><div className="card-title">Top Aplikasi</div><div className="card-subtitle">Berdasarkan volume tiket</div></div>
          <div className="card-body">
            {appRanked.length === 0
              ? <div style={{ fontSize:13, color:'var(--text-muted)' }}>Tidak ada data</div>
              : <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                  {appRanked.map(([name, count]) => (
                    <div key={name}>
                      <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:4 }}>
                        <span style={{ fontWeight:500 }}>{name}</span>
                        <span className="mono" style={{ color:'var(--text-muted)' }}>{count}</span>
                      </div>
                      <div style={{ height:6, background:'var(--surface-2)', borderRadius:3, overflow:'hidden' }}>
                        <div style={{ width:`${(count / maxAppCount) * 100}%`, height:'100%', background:'#6366f1', borderRadius:3 }}></div>
                      </div>
                    </div>
                  ))}
                </div>
            }
          </div>
        </div>
      </div>

      {/* Kategori Permintaan + Aging */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:16 }}>
        <div className="card">
          <div className="card-header"><div className="card-title">Kategori Permintaan</div><div className="card-subtitle">Berdasarkan Specific Task</div></div>
          <table className="table">
            <thead><tr><th>Kategori</th><th>Jumlah</th><th>%</th></tr></thead>
            <tbody>
              {taskRanked.length === 0
                ? <tr><td colSpan={3} style={{ textAlign:'center', color:'var(--text-muted)', fontSize:13 }}>Tidak ada data</td></tr>
                : taskRanked.map(([name, count]) => (
                    <tr key={name}>
                      <td style={{ fontWeight:500, fontSize:12 }}>{name}</td>
                      <td className="mono" style={{ fontSize:12 }}>{count}</td>
                      <td style={{ fontSize:12, color:'var(--text-muted)' }}>{total > 0 ? Math.round(count / total * 100) : 0}%</td>
                    </tr>
                  ))
              }
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Aging Tiket Open/Waiting</div>
              <div className="card-subtitle">{agingTickets.length} tiket belum selesai</div>
            </div>
            {longAgingCount > 0 && (
              <span style={{ fontSize:11, padding:'3px 8px', background:'#fef2f2', color:'#dc2626', borderRadius:6, fontWeight:600, whiteSpace:'nowrap' }}>
                {longAgingCount} tiket ≥4 hari
              </span>
            )}
          </div>
          {agingTickets.length === 0
            ? <div className="card-body" style={{ fontSize:13, color:'var(--text-muted)' }}>Semua tiket dalam periode ini sudah selesai.</div>
            : <table className="table">
                <thead><tr><th>ID</th><th>Subject</th><th>PIC</th><th>Usia</th></tr></thead>
                <tbody>
                  {agingTickets.slice(0, 10).map(t => (
                    <tr key={t.id}>
                      <td className="mono" style={{ fontSize:10, color:'var(--text-muted)' }}>{t.id}</td>
                      <td style={{ fontSize:12, fontWeight:500, maxWidth:160, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{t.subject}</td>
                      <td style={{ fontSize:11, color:'var(--text-muted)' }}>{t.assignedName}</td>
                      <td>
                        <span style={{ fontSize:11, fontWeight:600, color: t.ageDays >= 4 ? '#dc2626' : t.ageDays >= 2 ? '#d97706' : 'var(--text-muted)', background: t.ageDays >= 4 ? '#fef2f2' : t.ageDays >= 2 ? '#fffbeb' : 'transparent', padding:'2px 6px', borderRadius:4 }}>
                          {t.ageDays}h
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
          }
        </div>
      </div>

      {/* Sorotan */}
      {total > 0 && (
        <div className="card">
          <div className="card-header"><div className="card-title">Sorotan Periode Ini</div></div>
          <div className="card-body">
            <div style={{ display:'flex', flexWrap:'wrap', gap:12 }}>
              {busiest && busiest.count > 0 && (
                <div style={{ flex:1, minWidth:180, padding:14, background:'var(--surface-2)', borderRadius:8, borderLeft:'3px solid var(--accent)' }}>
                  <div style={{ fontSize:11, fontWeight:600, textTransform:'uppercase', color:'var(--text-muted)', marginBottom:4 }}>Hari Tersibuk</div>
                  <div style={{ fontWeight:600 }}>{busiest.label}</div>
                  <div style={{ fontSize:12, color:'var(--text-muted)' }}>{busiest.count} tiket masuk</div>
                </div>
              )}
              {topApp && (
                <div style={{ flex:1, minWidth:180, padding:14, background:'var(--surface-2)', borderRadius:8, borderLeft:'3px solid #6366f1' }}>
                  <div style={{ fontSize:11, fontWeight:600, textTransform:'uppercase', color:'var(--text-muted)', marginBottom:4 }}>Aplikasi Teratas</div>
                  <div style={{ fontWeight:600 }}>{topApp[0]}</div>
                  <div style={{ fontSize:12, color:'var(--text-muted)' }}>{topApp[1]} tiket ({Math.round(topApp[1] / total * 100)}% dari total)</div>
                </div>
              )}
              {picRanked[0] && (
                <div style={{ flex:1, minWidth:180, padding:14, background:'var(--surface-2)', borderRadius:8, borderLeft:'3px solid #16a34a' }}>
                  <div style={{ fontSize:11, fontWeight:600, textTransform:'uppercase', color:'var(--text-muted)', marginBottom:4 }}>PIC Beban Tertinggi</div>
                  <div style={{ fontWeight:600 }}>{picRanked[0].name}</div>
                  <div style={{ fontSize:12, color:'var(--text-muted)' }}>{picRanked[0].count} tiket ({Math.round(picRanked[0].count / total * 100)}% dari total)</div>
                </div>
              )}
              {longAgingCount > 0 && (
                <div style={{ flex:1, minWidth:180, padding:14, background:'#fef2f2', borderRadius:8, borderLeft:'3px solid #dc2626' }}>
                  <div style={{ fontSize:11, fontWeight:600, textTransform:'uppercase', color:'#dc2626', marginBottom:4 }}>Perlu Eskalasi</div>
                  <div style={{ fontWeight:600, color:'#dc2626' }}>{longAgingCount} tiket ≥4 hari</div>
                  <div style={{ fontSize:12, color:'#dc2626' }}>Belum selesai, perlu prioritas</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── MAIN PAGE ─────────────────────────────────────────────────────────────────
export default function AdminPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [page, setPage] = useState('dashboard');
  const { tickets, setTickets, loading: ticketsLoading } = useTickets();

  const { teams: allTeams, pics: allPics, categories: allCategories, apps: allApps, slaRules: allSlaRules, kbArticles: allKbArticles, loading: masterLoading, refresh: refreshMasterData } = useMasterData();

  useEffect(() => {
    const s = getSession();
    if (!s || s.role !== 'admin') { router.replace('/login'); return; }
    setSession(s);
  }, [router]);

  if (!session || masterLoading || ticketsLoading) return null;

  const pageTitle: Record<string, string> = { dashboard:'Dashboard', reporting:'Reporting & Analytics', kb:'Knowledge Base', tickets:'Semua Tiket', 'tickets-closed':'Tiket Closed', routing:'Routing Rules', apps:'Manajemen Aplikasi', config:'Kategori & SLA', users:'Manajemen Pengguna', import:'Import Pengguna', cutoff:'Cutoff & Rekap Tiket', 'weekly-report':'Laporan Mingguan' };

  return (
    <div className="sw-app" style={{ flexDirection: 'column' }}>
      <div className="sw-topbar">
        <div className="sw-logo">🛠 IT Helpdesk</div>
        <div className="sw-topbar-right">
          <div className="sw-user-avatar">{session.initials}</div>
          <button style={{ fontSize:11, padding:'6px 12px', border:'1px solid var(--border)', borderRadius:6, background:'none', color:'var(--text-secondary)', cursor:'pointer' }} onClick={() => { logout(); router.replace('/login'); }}>Logout</button>
        </div>
      </div>

      <div className="sw-secondbar">
        <div className="sw-secondbar-inner">
          <span className="sw-secondbar-title">IT Helpdesk</span>
          <span className="sw-sep">/</span>
          <span className="sw-secondbar-page">Admin Panel</span>
          <span className="sw-sep">/</span>
          <span className="sw-secondbar-page">{pageTitle[page] || page}</span>
        </div>
      </div>

      {/* SIDEBAR - LEFT */}
      <div className="sw-body">
        <div className="sw-sidebar">
          <div className="sw-sidebar-section">
            <div className="sw-sidebar-section-title">MONITORING</div>
            <NavItem label="Dashboard" count={tickets.length} active={page==='dashboard'} onClick={() => setPage('dashboard')} />
            <NavItem label="Semua Tiket" count={tickets.filter(t => ['Open','In Progress'].includes(t.status)).length} active={page==='tickets'} onClick={() => setPage('tickets')} />
            <NavItem label="Tiket Closed" count={tickets.filter(t => ['Done','Closed'].includes(t.status)).length} active={page==='tickets-closed'} onClick={() => setPage('tickets-closed')} />
            <NavItem label="Routing Rules" active={page==='routing'} onClick={() => setPage('routing')} />
          </div>
          <div className="sw-sidebar-section">
            <div className="sw-sidebar-section-title">KONFIGURASI</div>
            <NavItem label="Aplikasi" active={page==='apps'} onClick={() => setPage('apps')} />
            <NavItem label="Config" active={page==='config'} onClick={() => setPage('config')} />
            <NavItem label="Users" active={page==='users'} onClick={() => setPage('users')} />
            <NavItem label="Import" active={page==='import'} onClick={() => setPage('import')} />
          </div>
          <div className="sw-sidebar-section">
            <div className="sw-sidebar-section-title">INFORMASI</div>
            <NavItem label="Knowledge Base" active={page==='kb'} onClick={() => setPage('kb')} />
            <NavItem label="Reporting" active={page==='reporting'} onClick={() => setPage('reporting')} />
            <NavItem label="Laporan Mingguan" active={page==='weekly-report'} onClick={() => setPage('weekly-report')} />
          </div>
          <div className="sw-sidebar-section">
            <div className="sw-sidebar-section-title">OPERASIONAL</div>
            <NavItem label="Cutoff & Rekap" active={page==='cutoff'} onClick={() => setPage('cutoff')} />
          </div>
        </div>

        {/* MAIN CONTENT - FULL WIDTH */}
        <div style={{ flex:1, overflow:'auto', padding:24 }}>
          {page === 'dashboard' && <DashboardPage tickets={tickets} allCategories={allCategories} />}
          {page === 'reporting' && <ReportingPage allPics={allPics} tickets={tickets} />}
          {page === 'kb' && <KBManagerPage allCategories={allCategories} allKbArticles={allKbArticles} onKbChange={refreshMasterData} />}
          {page === 'tickets' && <AllTicketsPage tickets={tickets} setTickets={setTickets} allPics={allPics} allCategories={allCategories} allTeams={allTeams} allApps={allApps} allSlaRules={allSlaRules} />}
          {page === 'tickets-closed' && <AllTicketsPage tickets={tickets} setTickets={setTickets} allPics={allPics} allCategories={allCategories} allTeams={allTeams} allApps={allApps} allSlaRules={allSlaRules} baseFilter={['Done','Closed']} />}
          {page === 'routing' && <RoutingRulesPage allPics={allPics} allApps={allApps} allTeams={allTeams} onRulesChange={refreshMasterData} />}
          {page === 'apps' && <AplikasiPage allApps={allApps} allCategories={allCategories} onAppChange={refreshMasterData} />}
          {page === 'config' && <ConfigPage tickets={tickets} allCategories={allCategories} allSlaRules={allSlaRules} onCategoryChange={refreshMasterData} onSlaChange={refreshMasterData} />}
          {page === 'users' && <UsersPage tickets={tickets} allPics={allPics} onPicChange={refreshMasterData} />}
          {page === 'import' && <ImportPenggunaPage onPicChange={refreshMasterData} />}
          {page === 'cutoff' && <CutoffPage tickets={tickets} setTickets={setTickets} />}
          {page === 'weekly-report' && <WeeklyReportPage tickets={tickets} allPics={allPics} />}
        </div>
      </div>
    </div>
  );
}
