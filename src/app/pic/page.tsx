'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getSession, logout } from '@/lib/auth';
import { ticketStore } from '@/lib/store';
import { specificTasks } from '@/lib/data';
import { useMasterData } from '@/lib/master-data';
import { formatDateTime, timeAgo, statusClass, slaProgress } from '@/lib/utils';
import { analyze, checkAutoClose } from '@/lib/rule-engine';
import type { Ticket, Session, Comment, AnalysisResult, Notification, PIC, Team, App, Category } from '@/types';

// ─── NAV LINK COMPONENT ───────────────────────────────────────────────────────
function NavLink({ href, icon, label, active, onClick }: { href?: string; icon: string; label: string; active?: boolean; onClick?: () => void }) {
  const content = (
    <div className={`sw-nav-link${active?' active':''}`} onClick={onClick}>
      <span className="nav-icon">{icon}</span>
      <span>{label}</span>
    </div>
  );
  
  if (href) {
    return <Link href={href}>{content}</Link>;
  }
  return content;
}

// ─── SIDEBAR ITEM ──────────────────────────────────────────────────────────────
function SidebarItem({ label, count, active, onClick, isTeam }: { label: string; count?: number; active?: boolean; onClick?: () => void; isTeam?: boolean }) {
  return (
    <div className={`sw-sidebar-item${active?' active':''}${isTeam?' is-team':''}`} onClick={onClick}>
      <span>{label}</span>
      {count !== undefined && <span className="sw-count">{count}</span>}
    </div>
  );
}

// ─── TICKET LIST ITEM ──────────────────────────────────────────────────────────
function TicketListItem({ ticket, selected, onClick }: { ticket: Ticket; selected: boolean; onClick: () => void }) {
  const isUnassigned = !ticket.assignedToId;
  const dotClass = 'sw-status-dot status-' + ticket.status.replace(' ', '-').toLowerCase();
  return (
    <div className={`sw-list-item${selected?' selected':''}`} onClick={onClick}>
      <div className="sw-list-item-left">
        <span className={dotClass}></span>
        <div className="sw-list-item-info">
          <div className="sw-list-item-subject">{ticket.subject}</div>
          <div className="sw-list-item-meta">
            <span className="sw-list-id">{ticket.id}</span>
            <span className="sw-list-dot">·</span>
            <span className="sw-list-from">{ticket.fromName}</span>
            <span className="sw-list-dot">·</span>
            <span className="sw-list-time">{timeAgo(ticket.createdAt)}</span>
          </div>
          {ticket.app && <div className="sw-list-item-app">{ticket.app}</div>}
        </div>
      </div>
      <div className="sw-list-item-right">
        {ticket.app && <span className="sw-app-badge">{ticket.app.split(']')[0] + ']'}</span>}
        {isUnassigned && <span className="sw-unassigned-badge">Unassigned</span>}
        {!isUnassigned && ticket.assignedName && (
          <div className="sw-assignee-mini">
            <div className="sw-avatar-sm">{ticket.assignedName.split(' ').map(n => n[0]).join('').slice(0, 2)}</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── STATUS DROPDOWN MENU ─────────────────────────────────────────────────────
function StatusDropdown({ currentStatus, onSelect, onClose }: { 
  currentStatus: string; 
  onSelect: (status: string) => void; 
  onClose: () => void;
}) {
  const statuses = [
    { value: 'Open', label: 'Open', color: 'status-open' },
    { value: 'In Progress', label: 'In Progress', color: 'status-in-progress' },
    { value: 'Pending', label: 'Pending', color: 'status-pending' },
    { value: 'Done', label: 'Done', color: 'status-done' },
    { value: 'Closed', label: 'Closed', color: 'status-closed' },
  ];

  return (
    <>
      <div className="sw-dropdown-backdrop" onClick={onClose} />
      <div className="sw-dropdown">
        {statuses.filter(s => s.value !== currentStatus).map(s => (
          <button 
            key={s.value} 
            className={`sw-dropdown-item ${s.color}`}
            onClick={() => { onSelect(s.value); onClose(); }}
          >
            <span className={`sw-status-dot ${s.color}`}></span>
            {s.label}
          </button>
        ))}
      </div>
    </>
  );
}

// ─── TICKET DETAIL ─────────────────────────────────────────────────────────────
function TicketDetail({ ticket, allPics, allTeams, allCategories, onUpdate, onAddComment, onAccept, onClose, currentPicId, onChangeStatus }: {
  ticket: Ticket;
  allPics: PIC[];
  allTeams: Team[];
  allCategories: Category[];
  onUpdate: (id: string, updates: Partial<Ticket>, note?: string) => void;
  onAddComment: (id: string, comment: Omit<Comment, 'isInternal'>, isInternal: boolean) => void;
  onAccept: () => void;
  onClose: () => void;
  currentPicId: string;
  onChangeStatus: (status: string) => void;
}) {
  const [comment, setComment] = useState('');
  const [showActivity, setShowActivity] = useState(false);
  const [isInternal, setIsInternal] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  const currentPic = allPics.find(p => p.id === currentPicId);
  const isAssignedToMe = ticket.assignedToId === currentPicId;
  const canAccept = !isAssignedToMe && !ticket.assignedToId;
  const canChangeStatus = isAssignedToMe && !['Done', 'Closed'].includes(ticket.status);

  const categoryName = allCategories.find(c => c.id === ticket.category)?.name || ticket.category;
  const assignedTeam = allTeams.find(t => t.id === ticket.assigneeTeamId);
  const assignedPic = allPics.find(p => p.id === ticket.assignedToId);
  const picLabel = assignedPic?.name || (assignedTeam ? `${assignedTeam.name} (Queued)` : 'Unassigned');

  const sla = slaProgress(ticket.createdAt, ticket.slaDeadline);
  const slaHoursLeft = Math.max(0, Math.round((new Date(ticket.slaDeadline).getTime() - Date.now()) / 3600000));
  const slaIcon = sla.status === 'breach' ? '🔴' : sla.status === 'warn' ? '🟡' : '🟢';
  const slaLabel = sla.status === 'breach' ? 'Breached' : sla.status === 'warn' ? 'At Risk' : 'On Track';

  const submitComment = () => {
    if (!comment.trim()) return;
    onAddComment(ticket.id, {
      id: 'c' + Date.now(),
      authorId: currentPicId,
      authorName: currentPic?.name || 'Unknown',
      authorInitials: currentPic?.initials || '??',
      time: new Date().toISOString(),
      body: comment.trim(),
    }, isInternal);
    setComment('');
  };

  return (
    <div className="sw-ticket-detail">
      <div className="sw-detail-header">
        <div className="sw-detail-header-left">
          <span className="sw-detail-id">{ticket.id}</span>
          <span className="sw-detail-subject">{ticket.subject}</span>
        </div>
        <div className="sw-detail-actions">
          {/* TERIMA TIKET BUTTON */}
          {canAccept && (
            <button className="sw-btn-accept" onClick={onAccept}>
              🤚 Terima Tiket
            </button>
          )}
          
          {/* ASSIGNED INDICATOR */}
          {isAssignedToMe && (
            <div className="sw-assigned-to-me">
              <span className="sw-check">✓</span> {currentPic?.name || 'Saya'}
            </div>
          )}

          {/* DONE BUTTON */}
          {isAssignedToMe && !['Done','Closed'].includes(ticket.status) && (
            <button 
              className="sw-btn-done" 
              onClick={() => onUpdate(ticket.id, { status:'Done', resolvedAt: new Date().toISOString() }, `Tiket diselesaikan (Done) oleh ${currentPic?.name}`)}
            >
              ✓ Selesai
            </button>
          )}

          {/* STATUS CHANGE DROPDOWN (3 dots) */}
          {canChangeStatus && (
            <div style={{ position: 'relative' }}>
              <button 
                className="sw-btn-more" 
                onClick={() => setShowDropdown(v => !v)}
                title="Ubah status"
              >
                ⋮
              </button>
              {showDropdown && (
                <StatusDropdown 
                  currentStatus={ticket.status} 
                  onSelect={onChangeStatus}
                  onClose={() => setShowDropdown(false)}
                />
              )}
            </div>
          )}

          <button className="sw-btn-x" onClick={onClose}>✕</button>
        </div>
      </div>

      <div className="sw-detail-content">
        <div className="sw-ticket-meta-block">
          <div className="sw-meta-row">
            <span className={`badge ${statusClass(ticket.status)}`}><span className="badge-dot"></span>{ticket.status}</span>
            <span className={`priority priority-${ticket.priority.toLowerCase()}`}><span className="priority-bar"></span>{ticket.priority}</span>
            <span className="sw-meta-text">{ticket.app}</span>
            <span className="sw-meta-text">{categoryName}</span>
          </div>
          <div className="sw-meta-row">
            <span className="sw-meta-label">Assigned Team:</span>
            <span className="sw-meta-text">{assignedTeam?.name || '-'}</span>
            <span className="sw-meta-label">Assigned PIC:</span>
            <span className="sw-meta-text">{picLabel}</span>
          </div>
          <div className="sw-meta-row">
            <span className="sw-meta-label">SLA:</span>
            <span className={`sw-sla-text sw-sla-${sla.status}`}>{slaIcon} {slaLabel}{sla.status !== 'breach' ? ` (${slaHoursLeft} jam tersisa)` : ''}</span>
            <div className="sla-bar" style={{ flex: 1, maxWidth: 160 }}>
              <div className={`sla-fill sla-${sla.status}`} style={{ width: `${sla.pct}%` }}></div>
            </div>
          </div>
        </div>
        <div className="sw-ticket-body-block">
          <div className="sw-ticket-from">
            <div className="sw-ticket-from-name">{ticket.fromName}</div>
            <div className="sw-ticket-from-email">{ticket.from}</div>
          </div>
          <div className="sw-ticket-body">{ticket.body}</div>
          {ticket.attachments.length > 0 && (
            <div style={{ display:'flex', flexWrap:'wrap', gap:10, marginTop:14 }}>
              {ticket.attachments.map((a, i) => (
                a.type.startsWith('image/') ? (
                  <a key={i} href={a.dataUrl} target="_blank" rel="noopener noreferrer">
                    <img src={a.dataUrl} alt={a.name} style={{ width:90, height:90, objectFit:'cover', borderRadius:8, border:'1px solid var(--border)' }} />
                  </a>
                ) : (
                  <a key={i} href={a.dataUrl} download={a.name} style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 14px', background:'var(--surface-2)', borderRadius:8, fontSize:12, textDecoration:'none', color:'var(--text)' }}>
                    📄 {a.name}
                  </a>
                )
              ))}
            </div>
          )}
        </div>

        <div className="sw-activity-feed">
          <button className="sw-activity-toggle" onClick={() => setShowActivity(v => !v)}>
            {showActivity ? '▼' : '▶'} {ticket.activity?.length || 0} aktivitas
          </button>
          {showActivity && (ticket.activity || []).map((act, i) => (
            <div key={i} className={`sw-activity-item sw-activity-${act.type}`}>
              <div className="sw-activity-icon">{act.type === 'system' ? '⚙' : '💬'}</div>
              <div className="sw-activity-body">
                <span className="sw-activity-text">{act.text || `Aktivitas oleh ${act.who}`}</span>
                {act.isInternal && <span className="sw-internal-tag">Internal</span>}
                <div className="sw-activity-time">{formatDateTime(act.time)}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="sw-comments">
          {(ticket.comments || []).length === 0 ? (
            <div className="sw-no-comments">Belum ada balasan</div>
          ) : (ticket.comments || []).map((c, i) => (
            <div key={i} className={`sw-comment${c.isInternal?' sw-comment-internal':''}`}>
              <div className="sw-comment-head">
                <div className="sw-comment-av">{c.authorInitials || c.authorName?.slice(0,2)}</div>
                <div><div className="sw-comment-name">{c.authorName}</div><div className="sw-comment-time">{formatDateTime(c.time)}</div></div>
                {c.isInternal && <span className="sw-internal-tag">Internal</span>}
              </div>
              <div className="sw-comment-body">{c.body}</div>
            </div>
          ))}
        </div>

        {isAssignedToMe && (
          <div className="sw-comment-box">
            <div className="sw-comment-type-toggle">
              <label className="sw-toggle-label">
                <input type="checkbox" checked={isInternal} onChange={e => setIsInternal(e.target.checked)} />
                <span>Kirim sebagai catatan internal</span>
              </label>
            </div>
            <textarea
              className="sw-comment-input"
              placeholder={isInternal ? 'Tulis catatan internal...' : 'Tulis komentar publik...'}
              value={comment}
              onChange={e => setComment(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) submitComment(); }}
            />
            <div className="sw-comment-toolbar">
              <button className="btn-primary sw-btn-sm" style={{ marginLeft:'auto' }} onClick={submitComment}>Kirim</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── EMAIL SIMULATOR ───────────────────────────────────────────────────────────
function EmailSimulator({ allTeams, allPics, allApps, onClose, onAnalyze }: { allTeams: Team[]; allPics: PIC[]; allApps: App[]; onClose: () => void; onAnalyze: (r: AnalysisResult & { subject: string; body: string; fromName: string; fromEmail: string; dept: string }) => void }) {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [fromName, setFromName] = useState('Andi Pratama');
  const [fromEmail, setFromEmail] = useState('andi.pratama@lippokarawaci.co.id');
  const [dept, setDept] = useState('Finance');
  const [result, setResult] = useState<AnalysisResult | null>(null);

  const doAnalyze = () => setResult(analyze(subject, body, { teams: allTeams, pics: allPics, apps: allApps }));
  const handleCreate = () => { if (!subject.trim() || !body.trim() || !result) return; onAnalyze({ ...result, subject, body, fromName, fromEmail, dept }); };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth:760 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div><div className="modal-title">📧 Simulasi Email Masuk</div><div className="modal-subtitle">Ketik email seperti yang masuk ke mailbox helpdesk.</div></div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:24 }}>
            <div>
              <div className="field"><label className="label">Subject Email *</label><input className="input" value={subject} onChange={e => setSubject(e.target.value)} placeholder="Contoh: Bug Cost Contract tidak bisa generate PO" /></div>
              <div className="field"><label className="label">Isi Email *</label><textarea className="textarea" value={body} onChange={e => setBody(e.target.value)} placeholder="Paste isi email di sini..." style={{ minHeight:180 }} /></div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <div className="field"><label className="label">Nama Pengirim</label><input className="input" value={fromName} onChange={e => setFromName(e.target.value)} /></div>
                <div className="field"><label className="label">Email</label><input className="input" value={fromEmail} onChange={e => setFromEmail(e.target.value)} /></div>
              </div>
              <div className="field"><label className="label">Departemen</label><input className="input" value={dept} onChange={e => setDept(e.target.value)} /></div>
              <button className="btn btn-secondary" style={{ width:'100%' }} onClick={doAnalyze}>🔍 Analyze Email</button>
            </div>
            {result ? (
              <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
                <div style={{ fontWeight:600, fontSize:14, marginBottom:4 }}>🤖 Hasil Auto-Routing</div>
                <div className="sw-ai-result">
                  {([['Application', result.app], ['Category', result.category], ['Specific Task', result.specificTask], ['Priority', result.priority], ['Team', result.teamName], ['PIC', result.assignedName]] as [string,string][]).map(([k,v]) => (
                    <div key={k} className="sw-ai-result-item"><span>{k}</span><span style={{ fontWeight: k==='PIC'?600:undefined }}>{v}</span></div>
                  ))}
                </div>
                <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                  {Object.entries(result.confidence).map(([k,v]) => (
                    <span key={k} style={{ fontSize:11, padding:'3px 10px', background:'var(--surface-3)', borderRadius:12 }}>{k}: {Math.round((v||0)*100)}%</span>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-muted)', fontSize:13 }}>
                Klik &ldquo;Analyze Email&rdquo; untuk melihat hasil routing
              </div>
            )}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Batal</button>
          <button className="btn btn-primary" onClick={handleCreate} disabled={!result}>{result ? '✓ Buat Tiket' : 'Analyze dulu'}</button>
        </div>
      </div>
    </div>
  );
}

// ─── NOTIFICATION PANEL ────────────────────────────────────────────────────────
function NotificationPanel({ notifications, isHead, onDone, onRead, onClose }: {
  notifications: Notification[]; isHead: boolean;
  onDone: (id: string) => void; onRead: (id: string) => void; onClose: () => void;
}) {
  return (
    <div style={{ position:'absolute', top:'calc(100% + 8px)', right:0, width:380, maxHeight:480, background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, boxShadow:'0 12px 40px rgba(0,0,0,0.15)', zIndex:1000, display:'flex', flexDirection:'column' }} onClick={e => e.stopPropagation()}>
      <div style={{ padding:'14px 18px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
        <div style={{ fontWeight:600, fontSize:14 }}>Notifikasi</div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          {isHead && <span style={{ fontSize:11, background:'var(--surface-3)', color:'var(--text-secondary)', padding:'3px 10px', borderRadius:12, fontWeight:500 }}>Head Dept</span>}
          <button style={{ background:'none', border:'none', cursor:'pointer', fontSize:16, lineHeight:1, color:'var(--text-muted)' }} onClick={onClose}>✕</button>
        </div>
      </div>
      <div style={{ overflowY:'auto', flex:1 }}>
        {notifications.length === 0 ? (
          <div style={{ padding:40, textAlign:'center', color:'var(--text-muted)', fontSize:13 }}>Tidak ada notifikasi</div>
        ) : notifications.map(n => (
          <div key={n.id} style={{ padding:'14px 18px', borderBottom:'1px solid var(--border)', background:n.isRead?'transparent':'var(--surface-2)', opacity:n.isRead?0.6:1 }}>
            <div style={{ display:'flex', alignItems:'flex-start', gap:10 }}>
              <span style={{ width:8, height:8, background: n.isRead?'transparent':'var(--status-open)', borderRadius:'50%', flexShrink:0, marginTop:5 }}></span>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontWeight:500, fontSize:13, marginBottom:3, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{n.subject}</div>
                <div style={{ fontSize:11, color:'var(--text-muted)', marginBottom:10 }}>dari <strong>{n.fromName}</strong> · {n.app || '—'} · {timeAgo(n.time)}</div>
                {!n.isRead && !isHead && <button style={{ padding:'5px 14px', fontSize:12, background:'var(--status-done)', color:'white', border:'none', borderRadius:6, cursor:'pointer', fontWeight:600 }} onClick={() => onDone(n.ticketId)}>✓ Done</button>}
                {!n.isRead && isHead && <button style={{ padding:'5px 12px', fontSize:12, background:'none', color:'var(--text-muted)', border:'1px solid var(--border)', borderRadius:6, cursor:'pointer' }} onClick={() => onRead(n.id)}>Tandai dibaca</button>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── MAIN PAGE ─────────────────────────────────────────────────────────────────
export default function PICPage() {
  const router = useRouter();
  const { teams: allTeams, pics: allPics, apps: allApps, categories: allCategories, slaRules: allSlaRules, loading: masterLoading } = useMasterData();
  const [session, setSession] = useState<Session | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState('inbox');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterTeam, setFilterTeam] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showEmailSim, setShowEmailSim] = useState(false);
  const [currentPicId, setCurrentPicId] = useState('p-ivan');
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotif, setShowNotif] = useState(false);
  const [currentNav, setCurrentNav] = useState<'tickets' | 'inventory' | 'knowledge' | 'reports'>('tickets');

  useEffect(() => {
    const s = getSession();
    if (!s || !['pic','admin'].includes(s.role)) { router.replace('/login'); return; }
    setSession(s);
    if (s.picId) setCurrentPicId(s.picId);
    const all = ticketStore.getAll();
    setTickets(all);
    setNotifications(
      all.filter(t => t.status === 'Open').map(t => ({
        id: t.id, ticketId: t.id, subject: t.subject, fromName: t.fromName,
        app: t.app, teamId: t.assigneeTeamId, time: t.createdAt, isRead: false,
      }))
    );
  }, [router]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === ticketStore.KEY) setTickets(ticketStore.getAll());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const currentPic = allPics.find(p => p.id === currentPicId);
  const isHead = currentPic?.isHead === true;
  const teamNotifs = notifications.filter(n => n.teamId === currentPic?.teamId);
  const unreadCount = teamNotifs.filter(n => !n.isRead).length;

  const updateTicket = (id: string, updates: Partial<Ticket>, note?: string) => {
    setTickets(prev => {
      const next = prev.map(t => {
        if (t.id !== id) return t;
        const newT: Ticket = { ...t, ...updates, updatedAt: new Date().toISOString() };
        if (note) newT.activity = [...(t.activity || []), { type: 'system', time: new Date().toISOString(), text: note }];
        return newT;
      });
      ticketStore.saveAll(next);
      return next;
    });
  };

  const addComment = (id: string, comment: Omit<Comment, 'isInternal'>, isInternal: boolean) => {
    setTickets(prev => {
      const next = prev.map(t => {
        if (t.id !== id) return t;
        const cmt: Comment = { ...comment, isInternal };
        const newT: Ticket = { ...t, comments: [...(t.comments || []), cmt], updatedAt: new Date().toISOString() };
        newT.activity = [...(t.activity || []), { type: 'comment', time: comment.time, who: comment.authorName, isInternal }];
        if (!isInternal && checkAutoClose(comment.body)) {
          newT.status = 'Done';
          newT.resolvedAt = new Date().toISOString();
          newT.activity = [...newT.activity, { type: 'system', time: new Date().toISOString(), text: '🤖 Auto-close trigger terdeteksi → status → Done' }];
        }
        return newT;
      });
      ticketStore.saveAll(next);
      return next;
    });
  };

  const acceptTicket = (id: string) => {
    const pic = allPics.find(p => p.id === currentPicId);
    updateTicket(id, { assignedToId: currentPicId, assignedName: pic?.name || currentPicId, assigneeTeamId: pic?.teamId, status: 'In Progress' }, `Tiket di-accept oleh ${pic?.name}`);
  };

  const changeTicketStatus = (id: string, newStatus: string) => {
    const pic = allPics.find(p => p.id === currentPicId);
    updateTicket(id, { status: newStatus as import('@/types').TicketStatus, resolvedAt: newStatus === 'Done' ? new Date().toISOString() : undefined }, `Status diubah ke "${newStatus}" oleh ${pic?.name}`);
  };

  const visible = useMemo(() => {
    let v = [...tickets];
    if (currentView === 'inbox') v = v.filter(t => t.status === 'Open');
    if (currentView === 'mytickets') v = v.filter(t => t.assignedToId === currentPicId && ['Open','In Progress','Pending'].includes(t.status));
    if (filterStatus !== 'all') v = v.filter(t => t.status === filterStatus);
    if (filterTeam !== 'all') v = v.filter(t => filterTeam === 'none' ? !t.assigneeTeamId : t.assigneeTeamId === filterTeam);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      v = v.filter(t => t.subject.toLowerCase().includes(q) || t.id.toLowerCase().includes(q) || t.fromName.toLowerCase().includes(q));
    }
    return v;
  }, [tickets, currentView, filterStatus, filterTeam, searchQuery, currentPicId]);

  const counts = useMemo(() => ({
    inbox: tickets.filter(t => t.status === 'Open').length,
    myTickets: tickets.filter(t => t.assignedToId === currentPicId && ['Open','In Progress','Pending','Revisi'].includes(t.status)).length,
    unassigned: tickets.filter(t => !t.assignedToId).length,
    open: tickets.filter(t => t.status === 'Open').length,
    inProgress: tickets.filter(t => t.status === 'In Progress').length,
    pending: tickets.filter(t => t.status === 'Pending').length,
    revisi: tickets.filter(t => t.status === 'Revisi').length,
    done: tickets.filter(t => t.status === 'Done').length,
    total: tickets.length,
  }), [tickets, currentPicId]);

  useEffect(() => {
    if (visible.length === 0) { setSelectedId(null); return; }
    setSelectedId(prev => (!prev || !visible.some(t => t.id === prev)) ? visible[0].id : prev);
  }, [visible]);

  const selected = tickets.find(t => t.id === selectedId) ?? null;

  // Nav page handler
  const handleNavClick = (nav: typeof currentNav) => {
    if (nav === 'inventory' || nav === 'knowledge' || nav === 'reports') {
      alert(`Halaman ${nav} sedang dalam pengembangan.`);
      return;
    }
    setCurrentNav(nav);
  };

  if (!session || masterLoading) return null;

  return (
    <div className="sw-app">
      {/* TOP BAR - SIMPLIFIED FOR PIC */}
      <div className="sw-topbar" style={{ justifyContent:'space-between' }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <div className="sw-logo">🛠 IT Helpdesk</div>
          <span style={{ fontSize:12, fontWeight:500, padding:'4px 10px', background:'var(--accent)', color:'#fff', borderRadius:4 }}>PIC Panel</span>
        </div>
        <div className="sw-topbar-right" style={{ position:'relative' }}>
          <select style={{ fontSize:12, padding:'6px 10px', border:'1px solid var(--border)', borderRadius:6, background:'var(--surface)', color:'var(--text)', marginRight:8, cursor:'pointer' }} value={currentPicId} onChange={e => { setCurrentPicId(e.target.value); setShowNotif(false); }}>
            {allPics.map(p => <option key={p.id} value={p.id}>{p.name}{p.isHead?' ★':''}</option>)}
          </select>
          <div style={{ position:'relative', display:'inline-block' }}>
            <button className="sw-btn-icon" onClick={() => setShowNotif(v => !v)}>🔔</button>
            {unreadCount > 0 && <span className="sw-notif-badge">{unreadCount}</span>}
          </div>
          <div className="sw-user-avatar">{currentPic?.initials || 'IT'}</div>
          <button style={{ fontSize:11, padding:'6px 12px', border:'1px solid var(--border)', borderRadius:6, background:'none', color:'var(--text-secondary)', cursor:'pointer' }} onClick={() => { logout(); router.replace('/login'); }}>Logout</button>
          {showNotif && <NotificationPanel notifications={teamNotifs} isHead={isHead} onDone={id => { updateTicket(id, { status:'Done', resolvedAt: new Date().toISOString() }, `Done via notif`); setNotifications(prev => prev.map(n => n.ticketId===id?{...n,isRead:true}:n)); }} onRead={id => setNotifications(prev => prev.map(n => n.id===id?{...n,isRead:true}:n))} onClose={() => setShowNotif(false)} />}
        </div>
      </div>

      {/* SECONDARY BAR */}
      <div className="sw-secondbar">
        <div className="sw-secondbar-inner">
          <span className="sw-secondbar-title">IT Helpdesk</span>
          <span className="sw-sep">/</span>
          <span className="sw-secondbar-page">{currentView === 'inbox' ? 'Inbox' : currentView === 'mytickets' ? 'Tugas Saya' : 'Semua Tiket'}</span>
        </div>
        <button className="sw-btn-primary" onClick={() => setShowEmailSim(true)}>+ Simulasi Email Masuk</button>
      </div>

      <div className="sw-body">
        {/* SIDEBAR */}
        <div className="sw-sidebar">
          <div className="sw-sidebar-section">
            <div className="sw-sidebar-section-title">WORKSPACE</div>
            <SidebarItem label="Inbox" count={counts.inbox} active={currentView==='inbox'} onClick={() => { setCurrentView('inbox'); setFilterStatus('all'); setFilterTeam('all'); setSelectedId(null); }} />
            <SidebarItem label="Tugas Saya" count={counts.myTickets} active={currentView==='mytickets'} onClick={() => { setCurrentView('mytickets'); setFilterStatus('all'); setFilterTeam('all'); setSelectedId(null); }} />
            <SidebarItem label="Semua Tiket" count={counts.total} active={currentView==='all'} onClick={() => { setCurrentView('all'); setFilterStatus('all'); setFilterTeam('all'); setSelectedId(null); }} />
          </div>
          <div className="sw-sidebar-section">
            <div className="sw-sidebar-section-title">STATUS</div>
            <SidebarItem label="Open" count={counts.open} active={filterStatus==='Open'} onClick={() => { setFilterStatus('Open'); setCurrentView('all'); setSelectedId(null); }} />
            <SidebarItem label="In Progress" count={counts.inProgress} active={filterStatus==='In Progress'} onClick={() => { setFilterStatus('In Progress'); setCurrentView('all'); setSelectedId(null); }} />
            <SidebarItem label="Pending" count={counts.pending} active={filterStatus==='Pending'} onClick={() => { setFilterStatus('Pending'); setCurrentView('all'); setSelectedId(null); }} />
            <SidebarItem label="Revisi" count={counts.revisi} active={filterStatus==='Revisi'} onClick={() => { setFilterStatus('Revisi'); setCurrentView('all'); setSelectedId(null); }} />
            <SidebarItem label="Done" count={counts.done} active={filterStatus==='Done'} onClick={() => { setFilterStatus('Done'); setCurrentView('all'); setSelectedId(null); }} />
          </div>
          <div className="sw-sidebar-section">
            <div className="sw-sidebar-section-title">TEAMS</div>
            {allTeams.map(team => {
              const count = tickets.filter(t => t.assigneeTeamId === team.id).length;
              return <SidebarItem key={team.id} label={team.name} count={count} active={filterTeam===team.id} onClick={() => { setFilterTeam(filterTeam===team.id?'all':team.id); setCurrentView('all'); setFilterStatus('all'); setSelectedId(null); }} isTeam />;
            })}
            <SidebarItem label="Unassigned" count={counts.unassigned} active={filterTeam==='none'} onClick={() => { setFilterTeam('none'); setCurrentView('all'); setFilterStatus('all'); setSelectedId(null); }} />
          </div>
        </div>

        {/* LIST PANE */}
        <div className="sw-list-pane">
          <div className="sw-list-toolbar">
            <input className="sw-search" placeholder="Cari tiket, ID, atau nama..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
            <div className="sw-toolbar-right">
              <div className="sw-filter-group">
                <select className="sw-select-sm" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                  <option value="all">Semua Status</option>
                  {['Open','In Progress','Pending','Revisi','Done','Closed'].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="sw-pagination">1–{visible.length} dari {tickets.length}</div>
            </div>
          </div>
          <div className="sw-list">
            {visible.length === 0 ? (
              <div className="sw-empty"><div className="sw-empty-icon">📭</div><div className="sw-empty-title">Tidak ada tiket</div><div className="sw-empty-sub">{currentView==='inbox'?'Inbox masih kosong':'Tidak ada tiket yang cocok filter'}</div></div>
            ) : visible.map(t => <TicketListItem key={t.id} ticket={t} selected={t.id===selectedId} onClick={() => setSelectedId(t.id)} />)}
          </div>
        </div>

        {/* DETAIL PANE */}
        <div className="sw-detail-pane">
          {selected ? (
            <TicketDetail
              ticket={selected}
              allPics={allPics}
              allTeams={allTeams}
              allCategories={allCategories}
              onUpdate={updateTicket}
              onAddComment={addComment} 
              onAccept={() => acceptTicket(selected.id)} 
              onClose={() => setSelectedId(null)} 
              currentPicId={currentPicId}
              onChangeStatus={(status) => changeTicketStatus(selected.id, status)}
            />
          ) : (
            <div className="sw-empty"><div className="sw-empty-sub">Pilih tiket di sebelah kiri</div></div>
          )}
        </div>
      </div>

      {showEmailSim && (
        <EmailSimulator
          allTeams={allTeams}
          allPics={allPics}
          allApps={allApps}
          onClose={() => setShowEmailSim(false)}
          onAnalyze={result => {
            const newId = `ITLK-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${String(tickets.length+1).padStart(4,'0')}`;
            const now = new Date().toISOString();
            const deadline = new Date(Date.now() + (allSlaRules.find(s => s.priority === result.priority)?.targetHours ?? 24) * 3600 * 1000).toISOString();
            const newTicket: Ticket = {
              id: newId, subject: result.subject!, from: result.fromEmail!, fromName: result.fromName!, dept: result.dept!, cc: ['helpdesk@lippokarawaci.co.id'],
              body: result.body!, app: result.app, category: result.category, specificTask: result.specificTask, priority: result.priority,
              assigneeTeamId: result.teamId, assignedToId: result.assignedId, assignedName: result.assignedName, status: 'Open', autoRouted: true,
              autoRouteConfidence: result.confidence, createdAt: now, updatedAt: now, slaDeadline: deadline, attachments: [], comments: [],
              activity: [
                { type: 'system', time: now, text: 'Tiket dibuat dari simulasi email' },
                { type: 'system', time: now, text: `Auto-routing: App=${result.app}, Task=${result.specificTask}, Priority=${result.priority}, PIC=${result.assignedName}` },
              ],
            };
            ticketStore.add(newTicket);
            setTickets(prev => [newTicket, ...prev]);
            setSelectedId(newId);
            setShowEmailSim(false);
          }}
        />
      )}
    </div>
  );
}