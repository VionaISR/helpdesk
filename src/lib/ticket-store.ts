import { useCallback, useEffect, useState } from 'react';
import type { Ticket, TicketStatus, TicketPriority, Attachment, Comment, ActivityItem } from '@/types';
import { supabase } from '@/lib/supabase/client';
import { seedTickets } from '@/lib/data';

// ─── ROW <-> TYPE MAPPING ────────────────────────────────────────────────────
// Tickets live in Supabase as a single jsonb-heavy table — comments,
// activity and attachments are stored as jsonb columns with the exact same
// shape as Comment[]/ActivityItem[]/Attachment[] in src/types/index.ts, so
// no separate comments/ticket_timeline tables are needed.

interface TicketRow {
  id: string;
  subject: string;
  body: string | null;
  from_email: string;
  from_name: string | null;
  dept: string | null;
  cc: string[] | null;
  category: string | null;
  app: string | null;
  specific_task: string | null;
  priority: string;
  assignee_team_id: string | null;
  assigned_to_id: string | null;
  assigned_name: string | null;
  status: string;
  auto_routed: boolean | null;
  auto_route_confidence: Ticket['autoRouteConfidence'] | null;
  sla_deadline: string | null;
  resolved_at: string | null;
  attachments: Attachment[] | null;
  comments: Comment[] | null;
  activity: ActivityItem[] | null;
  csat: number | null;
  created_at: string;
  updated_at: string;
}

function mapTicketRow(row: TicketRow): Ticket {
  return {
    id: row.id,
    subject: row.subject,
    from: row.from_email,
    fromName: row.from_name ?? '',
    dept: row.dept ?? '',
    cc: row.cc ?? undefined,
    body: row.body ?? '',
    category: row.category ?? '',
    app: row.app ?? '',
    specificTask: row.specific_task ?? '',
    priority: row.priority as TicketPriority,
    assigneeTeamId: row.assignee_team_id,
    assignedToId: row.assigned_to_id,
    assignedName: row.assigned_name ?? 'Unassigned',
    status: row.status as TicketStatus,
    autoRouted: row.auto_routed ?? false,
    autoRouteConfidence: row.auto_route_confidence ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    slaDeadline: row.sla_deadline ?? '',
    resolvedAt: row.resolved_at ?? undefined,
    attachments: row.attachments ?? [],
    comments: row.comments ?? [],
    activity: row.activity ?? [],
    csat: row.csat ?? undefined,
  };
}

function ticketToRow(t: Ticket): TicketRow {
  return {
    id: t.id,
    subject: t.subject,
    body: t.body ?? null,
    from_email: t.from,
    from_name: t.fromName ?? null,
    dept: t.dept ?? null,
    cc: t.cc ?? null,
    category: t.category ?? null,
    app: t.app ?? null,
    specific_task: t.specificTask ?? null,
    priority: t.priority,
    assignee_team_id: t.assigneeTeamId,
    assigned_to_id: t.assignedToId,
    assigned_name: t.assignedName ?? null,
    status: t.status,
    auto_routed: t.autoRouted ?? false,
    auto_route_confidence: t.autoRouteConfidence ?? null,
    sla_deadline: t.slaDeadline || null,
    resolved_at: t.resolvedAt ?? null,
    attachments: t.attachments ?? [],
    comments: t.comments ?? [],
    activity: t.activity ?? [],
    csat: t.csat ?? null,
    created_at: t.createdAt,
    updated_at: t.updatedAt,
  };
}

// Maps Ticket (camelCase) field names to tickets table (snake_case) columns,
// used to build a partial update payload from Partial<Ticket>.
const TICKET_FIELD_TO_COLUMN: Record<string, string> = {
  subject: 'subject',
  body: 'body',
  from: 'from_email',
  fromName: 'from_name',
  dept: 'dept',
  cc: 'cc',
  category: 'category',
  app: 'app',
  specificTask: 'specific_task',
  priority: 'priority',
  assigneeTeamId: 'assignee_team_id',
  assignedToId: 'assigned_to_id',
  assignedName: 'assigned_name',
  status: 'status',
  autoRouted: 'auto_routed',
  autoRouteConfidence: 'auto_route_confidence',
  slaDeadline: 'sla_deadline',
  resolvedAt: 'resolved_at',
  attachments: 'attachments',
  comments: 'comments',
  activity: 'activity',
  csat: 'csat',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
};

function partialTicketToRow(patch: Partial<Ticket>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const [field, column] of Object.entries(TICKET_FIELD_TO_COLUMN)) {
    if (field in patch) row[column] = (patch as Record<string, unknown>)[field];
  }
  return row;
}

// Logs the error (if any) and returns its message, or null on success — so
// callers can `await` a mutation and surface the failure in the UI instead of
// it being swallowed silently.
function logError(action: string, error: { message: string } | null): string | null {
  if (error) {
    console.error(`[ticket-store] ${action} failed:`, error.message);
    return error.message;
  }
  return null;
}

// ─── FETCH (with seed-on-empty fallback, mirrors old ticketStore.getAll) ────

export async function fetchTickets(): Promise<Ticket[]> {
  const { data, error } = await supabase
    .from('tickets')
    .select('*')
    .order('created_at', { ascending: false });
  logError('fetch tickets', error);

  if (!error && (!data || data.length === 0)) {
    const seeded = seedTickets.map(ticketToRow);
    const { error: seedErr } = await supabase.from('tickets').insert(seeded);
    logError('seed tickets', seedErr);
    if (!seedErr) return JSON.parse(JSON.stringify(seedTickets)) as Ticket[];
  }

  return ((data ?? []) as TicketRow[]).map(mapTicketRow);
}

// ─── HOOK ────────────────────────────────────────────────────────────────────
// Replaces the old `storage` event listener (which only fired across tabs of
// the same browser). Refetches on mount, on window focus, and periodically —
// so tickets/comments created on another device show up here too.

const POLL_INTERVAL_MS = 20000;

export function useTickets() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const data = await fetchTickets();
    setTickets(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    return () => {
      window.removeEventListener('focus', onFocus);
      clearInterval(interval);
    };
  }, [refresh]);

  return { tickets, setTickets, loading, refresh };
}

// ─── MUTATIONS ───────────────────────────────────────────────────────────────

export async function insertTicket(ticket: Ticket): Promise<string | null> {
  const { error } = await supabase.from('tickets').insert(ticketToRow(ticket));
  return logError('insertTicket', error);
}

export async function updateTicketFields(id: string, patch: Partial<Ticket>): Promise<string | null> {
  const row = partialTicketToRow(patch);
  if (Object.keys(row).length === 0) return null;
  const { error } = await supabase.from('tickets').update(row).eq('id', id);
  return logError('updateTicketFields', error);
}

// Atomically append comment(s) / activity item(s) to a ticket, optionally
// changing status. Unlike updateTicketFields — which overwrites the whole
// comments/activity array from a possibly-stale client snapshot, losing any
// concurrent reply — this runs a single row-locked UPDATE on the server via
// the append_ticket_event() function (see supabase/schema.sql), so two people
// replying to the same ticket within the 20s poll window can't clobber each
// other.
export async function appendTicketEvent(
  id: string,
  ev: { comments?: Comment[]; activity?: ActivityItem[]; status?: TicketStatus; resolvedAt?: string },
): Promise<string | null> {
  const { error } = await supabase.rpc('append_ticket_event', {
    p_id: id,
    p_comments: ev.comments ?? [],
    p_activity: ev.activity ?? [],
    p_status: ev.status ?? null,
    p_resolved_at: ev.resolvedAt ?? null,
  });
  return logError('appendTicketEvent', error);
}

export async function deleteTicket(id: string): Promise<string | null> {
  const { error } = await supabase.from('tickets').delete().eq('id', id);
  return logError('deleteTicket', error);
}

export async function deleteTickets(ids: string[]): Promise<string | null> {
  if (ids.length === 0) return null;
  const { error } = await supabase.from('tickets').delete().in('id', ids);
  return logError('deleteTickets', error);
}
