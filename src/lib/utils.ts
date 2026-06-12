import type { TicketStatus, SlaProgress } from '@/types';

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return `${Math.floor(diff)} detik lalu`;
  if (diff < 3600) return `${Math.floor(diff / 60)} menit lalu`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} jam lalu`;
  return `${Math.floor(diff / 86400)} hari lalu`;
}

export function slaProgress(createdAt: string, deadline: string): SlaProgress {
  const created = new Date(createdAt).getTime();
  const due = new Date(deadline).getTime();
  const now = Date.now();
  const total = due - created;
  const elapsed = now - created;
  const pct = Math.min(100, (elapsed / total) * 100);
  const breached = now > due;
  return {
    pct,
    breached,
    status: breached ? 'breach' : pct > 75 ? 'warn' : 'ok',
  };
}

export function statusClass(status: TicketStatus): string {
  const map: Record<string, string> = {
    'Open':        'status-open',
    'In Progress': 'status-progress',
    'Pending':     'status-pending',
    'Revisi':      'status-revisi',
    'Done':        'status-done',
    'Resolved':    'status-done',
    'Closed':      'status-closed',
  };
  return map[status] || 'status-open';
}

export function generateTicketId(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.floor(Math.random() * 900 + 100);
  return `ITLK-${date}-${rand}`;
}

export function initials(name: string): string {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
}
