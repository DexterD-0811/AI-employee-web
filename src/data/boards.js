// Starting data for the Task board, Assigned board, Weekly goals and Reports.
// Edits people make in the app are saved in their own browser (localStorage).
// UTIL, HOURS and ATTEND are sample report figures until real data is connected.

export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
export const COLS = [['todo', 'To do'], ['doing', 'In progress'], ['review', 'Review'], ['done', 'Done']];
export const SEED_TASKS = [
  ['Summarize competitor research', 'nova', 'doing', 'High', 'Thu', ''],
  ['Draft Q4 market brief', 'nova', 'todo', 'Med', 'Fri', ''],
  ['Clear the support ticket backlog', 'atlas', 'doing', 'High', 'Thu', 'g1'],
  ['Update FAQ for new pricing', 'atlas', 'review', 'Low', 'Fri', 'g1'],
  ['Design review: onboarding flow', 'pixel', 'doing', 'Med', 'Thu', 'g2'],
  ['Export the new icon set', 'pixel', 'done', 'Med', 'Tue', 'g2'],
  ['Reconcile November invoices', 'ledger', 'doing', 'High', 'Fri', 'g5'],
  ['Close October books', 'ledger', 'done', 'High', 'Mon', 'g5'],
  ['Regression test release 2.4', 'echo', 'todo', 'High', 'Fri', 'g2'],
  ['Write the launch blog post', 'quill', 'review', 'Med', 'Fri', 'g3'],
  ['Newsletter draft', 'quill', 'done', 'Low', 'Wed', 'g3'],
  ['Plan next week’s social posts', 'kai', 'doing', 'Med', 'Fri', 'g3'],
  ['Review vendor contract', 'sage', 'doing', 'High', 'Thu', 'g5'],
  ['Sprint planning', 'byte', 'doing', 'Med', 'Thu', 'g2'],
  ['Fix login timeout bug', 'byte', 'done', 'High', 'Tue', 'g2'],
  ['Schedule team 1:1s', 'juno', 'todo', 'Low', 'Fri', ''],
  ['Follow up with new leads', 'scout', 'todo', 'High', 'Thu', 'g4'],
  ['Weekly metrics dashboard', 'orbit', 'review', 'Med', 'Fri', ''],
  ['Night-shift handover notes', 'leo', 'done', 'Med', 'Thu', ''],
  ['Triage the afternoon queue', 'mara', 'todo', 'Med', 'Thu', 'g1']
].map((r, i) => ({ id: 't' + (i + 1), title: r[0], agent: r[1], status: r[2], prio: r[3], due: r[4], goal: r[5] }));
export const SEED_GOALS = [
  { id: 'g1', title: 'Resolve 40 support tickets', current: 31, target: 40, unit: 'tickets', owners: ['atlas', 'echo', 'mara'] },
  { id: 'g2', title: 'Ship release 2.4', current: 3, target: 5, unit: 'milestones', owners: ['byte', 'pixel', 'echo'] },
  { id: 'g3', title: 'Publish 3 content pieces', current: 1, target: 3, unit: 'pieces', owners: ['quill', 'kai'] },
  { id: 'g4', title: 'Book 10 sales calls', current: 4, target: 10, unit: 'calls', owners: ['scout', 'mara'] },
  { id: 'g5', title: 'Close November books', current: 2, target: 4, unit: 'steps', owners: ['ledger', 'sage'] }
];

export const UTIL = [[86, 14, 8], [91, 15, 6], [88, 13, 9], [52, 9, 5], null, null, null];
export const HOURS = { nova: 31.5, atlas: 33, pixel: 28, ledger: 30.5, echo: 26, quill: 24.5, relay: 18, kai: 27, sage: 29.5, byte: 32, juno: 22, scout: 25.5, orbit: 27.5, leo: 34, mara: 20 };
export const ATTEND = [['Atlas', 'Clocked in', '07:55'], ['Nova', 'Clocked in', '08:02'], ['Ledger', 'Clocked in', '08:10'], ['Sage', 'Clocked in', '08:31'], ['Relay', 'Went idle', '15:16'], ['Leo', 'Clocked out', '15:12'], ['Mara', 'Clocked in', '15:30']];
