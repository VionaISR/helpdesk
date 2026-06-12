import type { Ticket } from '@/types';
import { seedTickets } from '@/lib/data';

const KEY = 'helpdesk_tickets';

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

export const ticketStore = {
  getAll(): Ticket[] {
    if (!isBrowser()) return JSON.parse(JSON.stringify(seedTickets));
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return JSON.parse(raw) as Ticket[];
    } catch { /* ignore */ }
    const seeded = JSON.parse(JSON.stringify(seedTickets)) as Ticket[];
    localStorage.setItem(KEY, JSON.stringify(seeded));
    return seeded;
  },

  saveAll(tickets: Ticket[]): void {
    if (!isBrowser()) return;
    localStorage.setItem(KEY, JSON.stringify(tickets));
  },

  add(ticket: Ticket): Ticket {
    const tickets = this.getAll();
    tickets.unshift(ticket);
    this.saveAll(tickets);
    return ticket;
  },

  update(id: string, updates: Partial<Ticket>): Ticket | null {
    const tickets = this.getAll();
    const idx = tickets.findIndex(t => t.id === id);
    if (idx < 0) return null;
    tickets[idx] = { ...tickets[idx], ...updates };
    this.saveAll(tickets);
    return tickets[idx];
  },

  remove(id: string): void {
    this.saveAll(this.getAll().filter(t => t.id !== id));
  },

  KEY,
};
