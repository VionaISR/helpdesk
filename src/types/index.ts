export type TicketStatus = 'Open' | 'In Progress' | 'Pending' | 'Revisi' | 'Done' | 'Closed';
export type TicketPriority = 'Low' | 'Medium' | 'High' | 'Critical';
export type UserRole = 'user' | 'pic' | 'admin';

export interface Comment {
  id: string;
  authorId: string;
  authorName: string;
  authorInitials: string;
  time: string;
  body: string;
  isInternal: boolean;
}

export interface ActivityItem {
  type: 'system' | 'comment' | 'status_change';
  time: string;
  text?: string;
  who?: string;
  isInternal?: boolean;
}

export interface Attachment {
  name: string;
  type: string;
  size: number;
  dataUrl: string;
}

export interface Ticket {
  id: string;
  subject: string;
  from: string;
  fromName: string;
  dept: string;
  cc?: string[];
  body: string;
  category: string;
  app: string;
  specificTask: string;
  priority: TicketPriority;
  assigneeTeamId: string | null;
  assignedToId: string | null;
  assignedName: string;
  status: TicketStatus;
  autoRouted: boolean;
  autoRouteConfidence?: { app: number; task: number; priority: number; route?: number };
  createdAt: string;
  updatedAt: string;
  slaDeadline: string;
  resolvedAt?: string;
  attachments: Attachment[];
  comments: Comment[];
  activity: ActivityItem[];
  isNew?: boolean;
  csat?: number;
}

export interface Team {
  id: string;
  name: string;
  headId: string;
  headName: string;
  headEmail: string;
  role?: string;
  memberIds: string[];
}

export interface PIC {
  id: string;
  name: string;
  initials: string;
  teamId: string;
  isHead?: boolean;
  email: string;
  subTeam?: string;
  role?: string;
}

export interface Category {
  id: string;
  name: string;
  color: string;
  picId?: string;
}

export interface App {
  id?: string;
  name: string;
  prefix: string;
  teamId: string | null;
  keywords: string[];
  picId?: string | null;
}

export interface SpecificTask {
  name: string;
  keywords: string[];
}

export interface KBArticle {
  id: string;
  title: string;
  category: string;
  views: number;
  updated: string;
  body?: string;
  isPublished?: boolean;
}

export interface SlaRule {
  id: string;
  priority: TicketPriority;
  targetHours: number;
  warningPercent: number;
}

export interface SampleUser {
  id: string;
  name: string;
  email: string;
  dept: string;
}

export interface Session {
  email: string;
  name: string;
  role: UserRole;
  picId: string | null;
  initials: string;
  loginAt: string;
}

export interface Notification {
  id: string;
  ticketId: string;
  subject: string;
  fromName: string;
  app: string;
  teamId: string | null;
  time: string;
  isRead: boolean;
}

export interface RouteResult {
  teamId: string | null;
  teamName: string;
  assignedId: string | null;
  assignedName: string;
  confidence: number;
}

export interface AnalysisResult {
  app: string;
  category: string;
  specificTask: string;
  priority: TicketPriority;
  teamId: string | null;
  teamName: string;
  assignedId: string | null;
  assignedName: string;
  subject?: string;
  body?: string;
  fromName?: string;
  fromEmail?: string;
  dept?: string;
  confidence: { app: number; task: number; priority: number; route: number };
}

export interface SlaProgress {
  pct: number;
  breached: boolean;
  status: 'ok' | 'warn' | 'breach';
}

export interface EmailConfig {
  enabled: boolean;
  publicKey: string;
  serviceId: string;
  templateId: string;
  fromEmail: string;
  notifyEmail: string;
}
