import type { App, AnalysisResult, RouteResult, TicketPriority, Team, PIC, Ticket } from '@/types';
import { apps, specificTasks, teams, pics, priorityKeywords, closeKeywords } from '@/lib/data';

export function detectApp(text: string, liveApps?: App[]): App | null {
  const appList = liveApps ?? apps;
  const lower = text.toLowerCase();
  let best: App | null = null;
  let bestScore = 0;
  for (const app of appList) {
    for (const kw of app.keywords) {
      if (lower.includes(kw.toLowerCase())) {
        const score = kw.length;
        if (score > bestScore) { bestScore = score; best = app; }
      }
    }
  }
  return best;
}

export function detectTask(text: string): string | null {
  const lower = text.toLowerCase();
  let best: string | null = null;
  let bestScore = 0;
  for (const task of specificTasks) {
    for (const kw of task.keywords) {
      if (lower.includes(kw.toLowerCase())) {
        const score = kw.length;
        if (score > bestScore) { bestScore = score; best = task.name; }
      }
    }
  }
  return best;
}

export function detectPriority(text: string): { priority: TicketPriority; confidence: number } {
  const lower = text.toLowerCase();
  for (const kw of priorityKeywords.Critical || []) if (lower.includes(kw.toLowerCase())) return { priority: 'Critical', confidence: 0.96 };
  for (const kw of priorityKeywords.High || [])     if (lower.includes(kw.toLowerCase())) return { priority: 'High',     confidence: 0.88 };
  for (const kw of priorityKeywords.Low || [])      if (lower.includes(kw.toLowerCase())) return { priority: 'Low',      confidence: 0.75 };
  return { priority: 'Medium', confidence: 0.70 };
}

export function autoRoute(app: App | null, liveData?: { teams: Team[]; pics: PIC[] }, existingTickets: Ticket[] = []): RouteResult {
  const teamList = liveData?.teams ?? teams;
  const picList = liveData?.pics ?? pics;

  if (!app || !app.teamId) {
    return { teamId: null, teamName: 'Unassigned', assignedId: null, assignedName: 'Unassigned', confidence: 0 };
  }
  const team = teamList.find(t => t.id === app.teamId);
  if (!team) return { teamId: app.teamId, teamName: app.teamId, assignedId: null, assignedName: 'Unassigned', confidence: 0.5 };

  const members = picList.filter(p => p.teamId === team.id && p.id !== team.headId);
  const candidatePool = members.length > 0 ? members : [picList.find(p => p.id === team.headId)!].filter(Boolean);

  const allTickets = existingTickets;
  const counts: Record<string, number> = {};
  for (const p of candidatePool) {
    counts[p.id] = allTickets.filter(t =>
      t.assignedToId === p.id && ['Open', 'In Progress', 'Pending'].includes(t.status)
    ).length;
  }
  const leastLoaded = candidatePool.reduce((a, b) => counts[a.id] <= counts[b.id] ? a : b);
  return { teamId: team.id, teamName: team.name, assignedId: leastLoaded.id, assignedName: leastLoaded.name, confidence: 0.85 };
}

export function checkAutoClose(text: string): boolean {
  const lower = text.toLowerCase().replace(/\s+/g, ' ');
  return closeKeywords.some(kw => lower.includes(kw));
}

export function analyze(subject: string, body: string, liveData?: { teams: Team[]; pics: PIC[]; apps?: App[] }, existingTickets: Ticket[] = []): AnalysisResult {
  const text = `${subject} ${body}`;
  const app = detectApp(text, liveData?.apps);
  const task = detectTask(text);
  const { priority, confidence: prioConf } = detectPriority(text);
  const route = autoRoute(app, liveData, existingTickets);
  return {
    app: app ? app.name : '[OTH] - Others',
    category: app ? app.prefix : 'OTH',
    specificTask: task ?? 'Bug',
    priority,
    teamId: route.teamId,
    teamName: route.teamName,
    assignedId: route.assignedId,
    assignedName: route.assignedName,
    confidence: {
      app:      app ? 0.92 : 0,
      task:     task ? 0.90 : 0.5,
      priority: prioConf,
      route:    route.confidence,
    },
  };
}
