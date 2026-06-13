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

// ─── ATTACHMENTS ──────────────────────────────────────────────────────────────
// Attachments are stored as base64 `data:` URLs. Chromium blocks top-level
// navigation to a `data:` URL (so `<a href="data:..." target="_blank">` won't
// open) and silently fails to download large ones. Converting to a Blob +
// object URL (`blob:`) sidesteps both limits, so open/download work reliably.

function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(',');
  const header = dataUrl.slice(0, comma);
  const data = dataUrl.slice(comma + 1);
  const mime = header.match(/^data:([^;]+)/)?.[1] || 'application/octet-stream';
  if (/;base64/i.test(header)) {
    const binary = atob(data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }
  return new Blob([decodeURIComponent(data)], { type: mime });
}

export function openAttachment(att: { dataUrl: string }): void {
  try {
    const url = URL.createObjectURL(dataUrlToBlob(att.dataUrl));
    window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch {
    window.open(att.dataUrl, '_blank', 'noopener');
  }
}

export function downloadAttachment(att: { dataUrl: string; name: string }): void {
  try {
    const url = URL.createObjectURL(dataUrlToBlob(att.dataUrl));
    const a = document.createElement('a');
    a.href = url;
    a.download = att.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch {
    const a = document.createElement('a');
    a.href = att.dataUrl;
    a.download = att.name;
    a.click();
  }
}
