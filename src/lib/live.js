// Turns rows from the shared workspace into the task cards, goals and dates the team room shows.

export const LIVE_COLS = [['doing', 'Being fixed'], ['review', 'With Ruth'], ['you', 'Your yes'], ['done', 'Approved']];
const COL_OF = { sent_back: 'doing', in_review: 'review', awaiting_approval: 'you', approved: 'done', published: 'done' };

export const KIND_LABEL = { landing_page: 'Landing page', pin: 'Pin', email: 'Email', video_script: 'Video script' };

export function ago(iso) {
  if (!iso) return '—';
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 1) return 'under 1m';
  if (m < 60) return m + 'm';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h ' + String(m % 60).padStart(2, '0') + 'm';
  return Math.floor(h / 24) + 'd';
}

export function shortDate(d) {
  if (!d) return '';
  const dt = new Date(d.length === 10 ? d + 'T12:00:00' : d);
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function weekStart() {
  const now = new Date(), day = (now.getDay() + 6) % 7;
  const mon = new Date(now); mon.setHours(0, 0, 0, 0); mon.setDate(now.getDate() - day);
  return mon.getTime();
}
const thisWeek = (iso) => iso && new Date(iso).getTime() >= weekStart();

export function liveTasks(drafts) {
  const soon = Date.now() + 10 * 86400000;
  return drafts.filter((d) => COL_OF[d.status]).map((d) => ({
    id: d.id, title: d.title, agent: d.employee_id, status: COL_OF[d.status],
    prio: d.scheduled_for && new Date(d.scheduled_for).getTime() < soon ? 'High' : d.campaign ? 'Med' : 'Low',
    due: d.scheduled_for ? shortDate(d.scheduled_for) : '—', goal: d.kind, kind: d.kind, draft: d
  }));
}

export function liveGoals(drafts) {
  const week = drafts.filter((d) => thisWeek(d.created_at) && d.status !== 'rejected');
  const made = (kind) => week.filter((d) => d.kind === kind).length;
  const reviewed = week.filter((d) => d.review).length;
  const decided = drafts.filter((d) => thisWeek(d.decided_at));
  const approved = decided.filter((d) => d.status === 'approved' || d.status === 'published').length;
  const waiting = drafts.filter((d) => d.status === 'awaiting_approval').length;
  return [
    { id: 'g-pages', title: 'Landing pages drafted', current: made('landing_page'), target: 6, unit: 'pages', owners: ['content'] },
    { id: 'g-pins', title: 'Pins drafted', current: made('pin'), target: 35, unit: 'pins', owners: ['pinterest'] },
    { id: 'g-emails', title: 'Emails drafted', current: made('email'), target: 3, unit: 'emails', owners: ['email'] },
    { id: 'g-reviewed', title: 'New drafts checked by Ruth', current: reviewed, target: Math.max(1, week.length), unit: 'drafts', owners: ['reviewer'] },
    { id: 'g-approved', title: 'Drafts you approved', current: approved, target: Math.max(1, approved + waiting), unit: 'drafts', owners: ['content', 'pinterest', 'email'] }
  ];
}

export function weekRuns(runs) { return runs.filter((r) => thisWeek(r.started_at)); }
export function weekDecided(drafts) { return drafts.filter((d) => thisWeek(d.decided_at)); }
export { thisWeek };
