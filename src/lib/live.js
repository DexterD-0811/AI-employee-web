// Turns rows from the shared workspace into the people, tasks and goals the office shows.

const PI = Math.PI;

// where each live employee sits, by their order (hq_employees.sort)
const DESKS = [[6, 4.6], [12, 4.6], [21, 4.6], [27, 4.6], [36, 4.6], [42, 4.6]];
// where they go on a break between runs, one spot each so nobody overlaps
const BREAK_SPOTS = [
  { at: [61.2, 20], yaw: PI / 2, pose: 'sip', zone: 'Coffee room' },
  { at: [78.4, 17.6], yaw: PI / 2, pose: 'sip', zone: 'Coffee room' },
  { at: [36, 34.6], yaw: 0, pose: 'rest', zone: 'Lunch room' },
  { at: [44, 48.4], yaw: PI, pose: 'rest', zone: 'Lunch room' },
  { at: [12, 13.4], yaw: PI, pose: 'rest', zone: 'Workspace' },
  { at: [21, 13.4], yaw: PI, pose: 'rest', zone: 'Workspace' }
];

export const LIVE_COLS = [['doing', 'Being fixed'], ['review', 'With Ruth'], ['you', 'Waiting for you'], ['done', 'Approved']];
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

// Fill one agent object from its employee row (keeps the same object so the 3D person stays linked)
function place(a, e, i, drafts) {
  const waiting = drafts.filter((d) => d.employee_id === e.id && d.status === 'awaiting_approval').length;
  const desk = DESKS[i % DESKS.length];
  Object.assign(a, {
    id: e.id, name: e.name, role: e.role, status: e.status, paused: e.paused,
    task: e.current_task || '—', since: ago(e.updated_at), lastRun: e.last_run_at,
    desk: 'Desk ' + String(i + 1).padStart(2, '0'), waiting,
    shirt: e.look.shirt || '#7c5cff', pants: e.look.pants || '#2b3a67', skin: e.look.skin || '#f5cd30',
    hair: e.look.hair || '#3b2418', hairStyle: e.look.hairStyle || 'short'
  });
  if (e.status === 'break') {
    const s = BREAK_SPOTS[i % BREAK_SPOTS.length];
    Object.assign(a, { at: s.at, yaw: s.yaw, pose: s.pose, zone: s.zone });
  } else {
    const pose = { working: 'type', waiting: 'gesture', idle: 'idle', paused: 'rest' }[e.status] || 'idle';
    Object.assign(a, { at: desk, yaw: 0, pose, zone: 'Workspace' });
  }
  return a;
}

export function liveAgents(data) {
  return data.employees.map((e, i) => place({}, e, i, data.drafts));
}

// update in place; returns the ids whose spot or pose changed
export function syncAgents(agents, data) {
  const moved = [];
  data.employees.forEach((e, i) => {
    const a = agents.find((x) => x.id === e.id);
    if (!a) return;
    const before = a.status + '|' + a.pose + '|' + String(a.at);
    place(a, e, i, data.drafts);
    if (before !== a.status + '|' + a.pose + '|' + String(a.at)) moved.push(a.id);
  });
  return moved;
}

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
