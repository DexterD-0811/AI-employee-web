// Little Faith Bots: the Little Faith Club team room. Signed in as an owner, it shows the real team from
// Supabase and lets you approve, send back or reject their drafts and pause them; signed out, it shows the
// same room with example data.
import './styles.css';
import { createTeamRoom, MODES, C } from './scene.js';
import { connect, fetchAll, signIn, signOut, decide, setPaused } from './lib/hq.js';
import { POLL_MS, OWNER_NAME } from './lib/config.js';
import { liveTasks, liveGoals, LIVE_COLS, KIND_LABEL, ago, shortDate, weekRuns, weekDecided, thisWeek } from './lib/live.js';
import { demoData } from './data/demo.js';

// how each employee looks and when they work
const PEOPLE = {
  content: { title: 'Content', color: C.plum, light: '#ece4f5', pron: 'Her', shift: 'Shifts Mon to Thu at 8:43 AM' },
  pinterest: { title: 'Pinterest', color: C.coral, light: '#f9d3c7', pron: 'His', shift: 'Shift every morning at 5:41 AM' },
  email: { title: 'Email', color: C.sage, light: '#d3e7d3', pron: 'Her', shift: 'Shift Thursdays at 1:45 PM' },
  reviewer: { title: 'Reviewer', color: C.blue, light: '#dbe8f1', pron: 'Her', shift: 'Checks every 2 hours, 7:45 AM to 7:45 PM' },
  blogger: { title: 'Blog', color: C.gold, light: '#fcefcf', pron: 'Her', shift: '3 blog ideas by 8 AM; publishes what you approve every hour until 9:47 PM' }
};
const SPARE = [[C.gold, '#fcefcf'], ['#2f3780', '#e4e7f5']];
const STATUS = {
  working: { label: 'On shift', dot: C.gold2 },
  waiting: { label: 'Waiting for you', dot: C.coral },
  break: { label: 'On break', dot: C.lav },
  idle: { label: 'Free', dot: C.grey },
  paused: { label: 'Paused', dot: C.grey }
};

const $ = (id) => document.getElementById(id);
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const para = (v) => esc(v || '').split(/\n{2,}/).map((x) => '<p>' + x.replace(/\n/g, '<br>') + '</p>').join('');
const toastEl = $('toast'); let toastT = 0;
function toast(m) { toastEl.textContent = m; toastEl.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { toastEl.hidden = true; }, 2600); }

connect().catch((err) => ({ mode: 'demo', reason: 'error', error: err.message })).then(start);

function start(hq) {
  const live = hq.mode === 'live';
  let data = live ? hq.data : demoData();
  let selected = null, tab = 'room', filter = null, noteFor = null, linkSent = null, busy = false;
  const openDrafts = new Set();

  const room = createTeamRoom($('scene'), {
    onPick: (p) => { if (p.bot) select(p.bot, true); else if (p.place === 'yes') openTab('yes'); else if (p.place === 'board') openTab('board'); },
    onCamera: () => document.querySelectorAll('[data-view]').forEach((b) => b.setAttribute('aria-pressed', 'false'))
  });

  // ---------------------------------------------------------------- data to people
  const look = (e, i) => PEOPLE[e.id] || { title: e.role.split(' ')[0], color: (e.look && e.look.shirt) || SPARE[i % 2][0], light: SPARE[i % 2][1], pron: 'Their', shift: '' };
  const byId = (id) => data.employees.find((e) => e.id === id);
  const lookOf = (id) => { const e = byId(id); return e ? look(e, data.employees.indexOf(e)) : { color: C.gold, light: C.goldL }; };
  const waitingDrafts = () => data.drafts.filter((d) => d.status === 'awaiting_approval').sort((a, b) => new Date(a.updated_at) - new Date(b.updated_at));
  function members() {
    const inReview = data.drafts.filter((d) => d.status === 'in_review');
    return data.employees.map((e, i) => {
      const p = look(e, i);
      const mine = data.drafts.filter((d) => d.employee_id === e.id).sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
      const latest = mine[0], waiting = mine.filter((d) => d.status === 'awaiting_approval').length;
      let screen;
      if (e.status === 'waiting') screen = { kind: 'waiting', title: 'Waiting for your yes', sub: waiting + (waiting === 1 ? ' draft to approve' : ' drafts to approve') };
      else if (e.id === 'reviewer') screen = inReview.length ? { kind: 'checks', title: 'Checking: ' + inReview[0].title, done: 2 } : { kind: 'checks', title: 'Review queue is empty', done: 4 };
      else if (e.id === 'pinterest') screen = { kind: 'pins', title: latest ? latest.title : 'Pins' };
      else if (e.id === 'blogger') screen = { kind: 'page', title: latest ? latest.title : 'Blog post' };
      else if (e.id === 'email') screen = { kind: 'email', title: latest ? latest.title : 'Email', sub: latest && latest.body && latest.body.subject };
      else screen = { kind: 'page', title: latest ? latest.title : 'Landing page' };
      const status = MODES[e.status] ? e.status : 'idle';
      const shiftLine = status === 'working' ? 'On shift now' : status === 'waiting' ? 'Waiting for your yes' : status === 'paused' ? 'Paused' : status === 'idle' ? 'Free' : (e.current_task || 'On break');
      return { id: e.id, name: e.name, title: p.title, role: e.role, color: p.color, light: p.light, status, say: e.current_task || STATUS[status].label, screen, screenAway: status === 'break' ? (e.current_task || 'On break') : 'Nothing to do right now', shiftLine };
    });
  }
  function boardColumns() {
    const tasks = liveTasks(data.drafts);
    return LIVE_COLS.map(([key, title]) => {
      const cards = tasks.filter((t) => t.status === key).map((t) => { const e = byId(t.agent); return { text: t.title, who: (e ? e.name : '') + ' · ' + KIND_LABEL[t.kind], color: lookOf(t.agent).color }; });
      return { title, cards, count: cards.length, gold: key === 'you' };
    });
  }

  // ---------------------------------------------------------------- the cards over the room
  function greet() {
    const h = new Date().getHours();
    return (h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening') + (OWNER_NAME ? ', ' + OWNER_NAME : '');
  }
  function renderHello() {
    $('greet').textContent = greet();
    const n = data.employees.length;
    const on = data.employees.filter((e) => e.status === 'working' || e.status === 'waiting').length;
    const off = data.employees.filter((e) => e.status === 'break' || e.status === 'idle').length;
    const paused = data.employees.filter((e) => e.status === 'paused').length;
    $('teamline').textContent = 'Your team of ' + n + ' · ' + on + ' on shift, ' + off + ' on break' + (paused ? ', ' + paused + ' paused' : '');
    const w = waitingDrafts().length;
    const chips = [['work', 'On shift ' + on, C.gold2], ['rest', 'On break ' + off, C.lav], ['yes', w + ' waiting for you', C.coral]];
    $('chips').innerHTML = chips.map((c) => '<button class="chip" type="button" data-filter="' + c[0] + '" aria-pressed="' + (filter === c[0]) + '"><i style="background:' + c[2] + '"></i>' + c[1] + '</button>').join('');
    $('mode').textContent = live ? 'Live · ' + hq.email : hq.reason === 'not_owner' ? 'Example team · ' + hq.email + ' isn’t an owner' : 'Example team';
    $('acct').textContent = live || hq.email ? 'Sign out' : 'Sign in';
    $('acct').hidden = hq.reason === 'unconfigured';
    $('yesN').textContent = String(w); $('yesN').hidden = !w;
  }
  $('chips').addEventListener('click', (e) => {
    const b = e.target.closest('[data-filter]'); if (!b) return;
    if (b.dataset.filter === 'yes') { openTab('yes'); return; }
    filter = filter === b.dataset.filter ? null : b.dataset.filter;
    room.setFilter(filter ? (d) => (filter === 'work') === (d.status === 'working' || d.status === 'waiting') : null);
    renderHello();
  });
  function drawFace(e, p) {
    const c = $('faceCv').getContext('2d'), awake = (MODES[e.status] || MODES.idle).awake, PI = Math.PI;
    c.clearRect(0, 0, 92, 92);
    c.fillStyle = p.color; c.beginPath(); c.ellipse(46, 50, 40, 32, 0, 0, PI * 2); c.fill();
    c.fillStyle = C.navy; c.beginPath(); c.moveTo(30, 32); c.arcTo(76, 32, 76, 68, 14); c.arcTo(76, 68, 16, 68, 14); c.arcTo(16, 68, 16, 32, 14); c.arcTo(16, 32, 76, 32, 14); c.closePath(); c.fill();
    c.lineCap = 'round';
    if (awake) { c.fillStyle = C.gold2; c.beginPath(); c.arc(35, 48, 5, 0, PI * 2); c.arc(57, 48, 5, 0, PI * 2); c.fill(); c.strokeStyle = C.gold2; c.lineWidth = 3.5; c.beginPath(); c.arc(46, 54, 7, PI * .2, PI * .8); c.stroke(); }
    else { c.strokeStyle = p.light; c.lineWidth = 3.5; c.beginPath(); c.arc(35, 46, 5, PI * .15, PI * .85); c.moveTo(62, 47); c.arc(57, 46, 5, PI * .15, PI * .85); c.stroke(); }
    c.strokeStyle = C.navy; c.lineWidth = 3; c.beginPath(); c.moveTo(46, 18); c.lineTo(46, 8); c.stroke();
    c.fillStyle = awake ? C.gold2 : p.light; c.beginPath(); c.arc(46, 8, 6, 0, PI * 2); c.fill(); c.stroke();
  }
  function renderBotCard() {
    const e = byId(selected) || data.employees[0]; if (!e) return; selected = e.id;
    const p = look(e, data.employees.indexOf(e)), st = STATUS[e.status] || STATUS.idle;
    $('botCard').style.background = p.light;
    $('botName').textContent = e.name; $('botRole').textContent = e.role;
    $('botState').innerHTML = '<i style="background:' + st.dot + '"></i>' + st.label;
    $('botDoing').textContent = e.current_task || st.label;
    const made = data.drafts.filter((d) => d.employee_id === e.id && thisWeek(d.created_at)).length;
    $('botWhere').textContent = [p.shift, e.last_run_at ? 'last shift ' + ago(e.last_run_at) + ' ago' : 'no shifts yet', made + (made === 1 ? ' draft' : ' drafts') + ' this week'].filter(Boolean).join(' · ');
    $('pause').textContent = e.paused ? 'Resume' : 'Pause';
    $('work').textContent = p.pron + ' work';
    drawFace(e, p);
  }
  function renderYesCard() {
    const w = waitingDrafts();
    $('yesList').innerHTML = w.length
      ? w.slice(0, 3).map((d) => { const e = byId(d.employee_id); return '<div class="mini-draft"><div><small>' + esc(KIND_LABEL[d.kind] || d.kind) + ' · ' + esc(e ? e.name : '') + '</small><b>' + esc(d.title) + '</b></div><button class="btn gold sm" type="button" data-review="' + esc(d.id) + '">Review</button></div>'; }).join('') + (w.length > 3 ? '<p class="muted">and ' + (w.length - 3) + ' more</p>' : '')
      : '<p class="quiet-note">All caught up. Ruth passes drafts here once she has checked them.</p>';
  }
  $('yesList').addEventListener('click', (e) => { const b = e.target.closest('[data-review]'); if (!b) return; openDrafts.add(b.dataset.review); openTab('yes'); });
  function select(id, fly) { selected = id; room.select(id, fly); renderBotCard(); if (fly) document.querySelectorAll('[data-view]').forEach((b) => b.setAttribute('aria-pressed', 'false')); }

  function renderAll() {
    room.setTeam(members());
    room.setBoard(boardColumns(), live ? '' : 'Example drafts');
    const w = waitingDrafts().length;
    room.setYes(w, w ? w + (w === 1 ? ' draft · ' : ' drafts · ') + (OWNER_NAME ? OWNER_NAME + '’s desk' : 'your desk') : 'Nothing waiting for you');
    room.setFlow(data.drafts.some((d) => d.status === 'in_review' || d.status === 'awaiting_approval'));
    room.select(selected, false);
    renderHello(); renderBotCard(); renderYesCard();
    if (tab !== 'room') renderDrawer(true);
  }

  // ---------------------------------------------------------------- the panels
  const TITLES = { yes: 'Waiting for your yes', board: 'Work board', week: 'This week', reports: 'Reports' };
  const drawer = $('drawer'), drBody = $('drBody');
  function openTab(t) {
    tab = t;
    document.querySelectorAll('.tabs [data-tab]').forEach((b) => { if (b.dataset.tab === t) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    if (t === 'room') { drawer.hidden = true; $('scene').focus(); return; }
    drawer.hidden = false; $('drTitle').textContent = TITLES[t]; renderDrawer(); drBody.scrollTop = 0;
  }
  document.querySelector('.tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) openTab(b.dataset.tab); });
  $('drClose').addEventListener('click', () => openTab('room'));
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !drawer.hidden) openTab('room'); });
  drBody.addEventListener('toggle', (e) => { const a = e.target.closest && e.target.closest('[data-draft]'); if (!a || e.target.tagName !== 'DETAILS') return; if (e.target.open) openDrafts.add(a.dataset.draft); else openDrafts.delete(a.dataset.draft); }, true);
  function renderDrawer(keepScroll) {
    const top = drBody.scrollTop, f = document.activeElement;
    if (keepScroll && f && drawer.contains(f) && /INPUT|TEXTAREA/.test(f.tagName)) return; // don't wipe what you're typing
    drBody.innerHTML = tab === 'yes' ? viewYes() : tab === 'board' ? viewBoard() : tab === 'week' ? viewWeek() : viewReports();
    if (keepScroll) drBody.scrollTop = top;
  }
  const whoChip = (id) => { const e = byId(id); if (!e) return ''; return '<button class="who-chip" type="button" data-bot="' + esc(e.id) + '"><i style="background:' + lookOf(id).color + '"></i>' + esc(e.name) + '</button>'; };
  const CHECK = { scripture: 'Scripture', faith: 'Faith', voice: 'Voice', facts_prices: 'Facts and prices', privacy: 'Privacy', format: 'Format', owner_note_addressed: 'Your note' };
  function preview(d) {
    const b = d.body || {};
    if (d.kind === 'landing_page') return '<p class="pv-meta">' + esc(b.path) + '</p><h4>' + esc(b.headline) + '</h4>' + para(b.subhead) + (b.sections || []).map((x) => '<h5>' + esc(x.heading) + '</h5>' + para(x.text)).join('') +
      (b.lead_magnet ? '<p class="pv-box"><b>Free printable:</b> ' + esc(b.lead_magnet.title) + '. ' + esc(b.lead_magnet.what_it_is) + '</p>' : '') + (b.cta ? '<p class="pv-box"><b>Main button:</b> ' + esc(b.cta.text) + '</p>' : '') +
      '<p class="pv-meta"><b>Search title:</b> ' + esc(b.meta_title) + '<br><b>Search description:</b> ' + esc(b.meta_description) + '</p>';
    if (d.kind === 'pin') return '<h4>' + esc(b.title) + '</h4>' + para(b.description) + '<p class="pv-meta"><b>Board:</b> ' + esc(b.board) + '<br><b>Links to:</b> ' + esc(b.link_path) + '<br><b>Image:</b> ' + esc(b.image_brief) + '</p>';
    if (d.kind === 'email') {
      const when = b.send_at ? new Date(b.send_at).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' }) + ' US Eastern' : '';
      return '<p class="pv-meta"><b>Subject:</b> ' + esc(b.subject) + '<br><b>Preview text:</b> ' + esc(b.preheader) + (when ? '<br><b>Sends:</b> ' + esc(when) : '') + '</p>' + (b.blocks || []).map((k) => (k.heading ? '<h5>' + esc(k.heading) + '</h5>' : '') + para(k.text) + (k.button ? '<p class="pv-box">[' + esc(k.button) + ']</p>' : '')).join('') + '<p class="pv-meta">' + esc(b.footer) + '</p>';
    }
    if (d.kind === 'blog_post') {
      const link = (u, t) => /^https:\/\//.test(u || '') ? '<a href="' + esc(u) + '" target="_blank" rel="noopener">' + esc(t || u) + '</a>' : esc(t || u || '');
      return (b.stage === 'published' ? '<p class="pv-box"><b>Published:</b> ' + esc(b.path) + (b.pr_url ? ' · ' + link(b.pr_url, 'pull request') : '') + '</p>' : '') +
        '<p class="pv-meta"><b>Search question:</b> ' + esc(b.search_question) + '<br><b>Page address:</b> ' + esc(b.path) + '<br><b>Points to:</b> ' + esc(b.links_to) + '</p>' +
        para(b.description) + '<p class="pv-box"><b>Why now:</b> ' + esc(b.why_now) + (b.source_url ? ' ' + link(b.source_url, b.source_title || 'Source') : '') + '</p>' +
        (b.outline && b.outline.length ? '<h5>Outline</h5><ol>' + b.outline.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ol>' : '') +
        (b.stage !== 'published' ? '<p class="muted">Approve and Janna writes the full post (800 to 1,100 words) and merges it to the website within the hour.</p>' : '');
    }
    return '<pre class="pv-raw">' + esc(JSON.stringify(b, null, 2)) + '</pre>';
  }
  function draftCard(d) {
    const rv = d.review || {}, noting = noteFor === d.id, list = (a) => '<ul>' + a.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul>';
    const checks = rv.checks ? Object.keys(rv.checks).filter((k) => rv.checks[k] === 'ok' || rv.checks[k] === 'fail').map((k) => '<span class="chk ' + (rv.checks[k] === 'ok' ? 'ok' : 'bad') + '">' + (rv.checks[k] === 'ok' ? '✓ ' : '✕ ') + esc(CHECK[k] || k) + '</span>').join('') : '';
    return '<article class="draft" data-draft="' + esc(d.id) + '">' +
      '<div class="draft-top"><b>' + esc(d.title) + '</b><span class="kind">' + esc(KIND_LABEL[d.kind] || d.kind) + '</span></div>' +
      '<div class="meta">' + whoChip(d.employee_id) + (d.scheduled_for ? '<span>For ' + shortDate(d.scheduled_for) + '</span>' : '') + (d.campaign ? '<span>' + esc(d.campaign) + '</span>' : '') + (d.revision > 1 ? '<span>Revision ' + d.revision + '</span>' : '') + '</div>' +
      (rv.passed === false ? '<p class="warn">Ruth couldn’t pass this after several rounds. Read her notes before you decide.</p>' : '') +
      (rv.needs_pastor ? '<p class="warn">Needs your pastor’s sign-off before it goes out.</p>' : '') +
      (rv.for_owner && rv.for_owner.length ? '<div class="flags"><b>Only you can settle</b>' + list(rv.for_owner) + '</div>' : '') +
      (checks ? '<div class="checks" aria-label="Ruth’s checks">' + checks + '</div>' : '') +
      (rv.notes && rv.notes.length ? '<div class="rnotes"><b>Ruth’s notes</b>' + list(rv.notes) + '</div>' : '') +
      (d.owner_note && d.revision > 1 ? '<p class="muted">Your last note: “' + esc(d.owner_note) + '”</p>' : '') +
      '<details' + (openDrafts.has(d.id) ? ' open' : '') + '><summary>Read the draft</summary><div class="preview">' + preview(d) + '</div></details>' +
      (noting ? '<label class="note" for="note-' + esc(d.id) + '">What should change? (needed to send it back)<textarea id="note-' + esc(d.id) + '" rows="3" maxlength="1000"></textarea></label>' : '') +
      '<div class="actions">' + (noting
        ? '<button class="btn quiet sm" type="button" data-cancel-note="1">Cancel</button><button class="btn quiet sm" type="button" data-decide="rejected" data-id="' + esc(d.id) + '">Reject</button><button class="btn gold sm" type="button" data-decide="sent_back" data-id="' + esc(d.id) + '">Send back</button>'
        : '<button class="btn quiet sm" type="button" data-note="' + esc(d.id) + '">Send back or reject…</button><button class="btn gold sm" type="button" data-decide="approved" data-id="' + esc(d.id) + '">Approve</button>') + '</div></article>';
  }
  function signInPanel() {
    if (live) return '';
    if (hq.reason === 'unconfigured') return '<div class="panel"><h3>Example team</h3><p class="muted">Live mode needs the workspace address and key in src/lib/config.js.</p></div>';
    if (hq.reason === 'not_owner') return '<div class="panel"><h3>Example team</h3><p class="muted">You’re signed in as ' + esc(hq.email) + ', which isn’t an owner of this workspace. An owner can add your email to hq_owners.</p><div class="actions"><button class="btn quiet sm" type="button" data-signout="1">Sign out</button></div></div>';
    if (linkSent) return '<div class="panel"><h3>Check your email</h3><p class="muted">We sent a sign-in link to ' + esc(linkSent) + '. Open it in this browser.</p></div>';
    return '<div class="panel"><h3>These are example drafts</h3><p class="muted">Sign in with your owner email to see your real team and approve their work.' + (hq.reason === 'error' ? ' (Couldn’t reach the workspace: ' + esc(hq.error) + ')' : '') + '</p>' +
      '<form class="form" id="signin-form"><label for="f-email">Email<input id="f-email" type="email" required autocomplete="email"></label><div class="actions"><button class="btn gold sm" type="submit">Email me a sign-in link</button></div></form></div>';
  }
  function viewYes() {
    const w = waitingDrafts();
    if (!openDrafts.size && w[0]) openDrafts.add(w[0].id);
    const withTeam = data.drafts.filter((d) => d.status === 'in_review' || d.status === 'sent_back').length;
    const recent = data.drafts.filter((d) => d.decided_at).sort((a, b) => new Date(b.decided_at) - new Date(a.decided_at)).slice(0, 8);
    const label = (d) => (d.status === 'approved' || d.status === 'published' ? 'Approved' : d.status === 'rejected' ? 'Rejected' : 'Sent back');
    return signInPanel() + '<p class="muted">' + w.length + ' waiting for you · ' + withTeam + ' still with the team · nothing goes out to families until you approve it</p>' +
      (w.length ? w.map(draftCard).join('') : '<p class="empty">All caught up. Ruth passes drafts here once she has checked them.</p>') +
      (recent.length ? '<div class="panel"><h3>Recently decided</h3><ul class="mini-list">' + recent.map((d) => '<li>' + esc(d.title) + '<span class="st">' + label(d) + ' · ' + shortDate(d.decided_at) + '</span></li>').join('') + '</ul></div>' : '');
  }
  function viewBoard() {
    const cols = boardColumns();
    return '<p class="muted">Every draft the team is working on, from first draft to your yes.</p><div class="kanban">' +
      cols.map((c) => '<section class="kcol' + (c.gold ? ' gold' : '') + '" aria-label="' + esc(c.title) + '"><h3><span>' + esc(c.title) + '</span><span>' + c.count + '</span></h3>' +
        (c.cards.length ? c.cards.map((k) => '<div class="kcard"><i style="background:' + k.color + '"></i><div><b>' + esc(k.text) + '</b><span>' + esc(k.who) + '</span></div></div>').join('') : '<p class="none">Nothing here</p>') + '</section>').join('') + '</div>';
  }
  function viewWeek() {
    return '<p class="muted">Counted from the drafts written since Monday. Each handprint is one piece of work.</p>' + liveGoals(data.drafts).map((g) => {
      const pct = Math.min(1, g.current / g.target), colour = lookOf(g.owners[0]).color;
      const prints = g.target <= 12 ? '<div class="prints" aria-hidden="true">' + Array.from({ length: g.target }, (_, i) => '<span class="print"' + (i < g.current ? ' style="background:' + colour + '"' : '') + '></span>').join('') + '</div>'
        : '<div class="track" role="img" aria-label="' + Math.round(pct * 100) + ' percent"><i style="width:' + (pct * 100) + '%;background:' + colour + '"></i></div>';
      return '<article class="goal"><div class="goal-top"><b>' + esc(g.title) + '</b><span class="tag" style="background:' + (pct >= 1 ? '#d3e7d3' : '#fcefcf') + '">' + g.current + ' of ' + g.target + '</span></div>' + prints + '<div class="meta">' + g.owners.map(whoChip).join('') + '</div></article>';
    }).join('');
  }
  function viewReports() {
    const runs = weekRuns(data.runs), decided = weekDecided(data.drafts), w = waitingDrafts().length;
    const approved = decided.filter((d) => d.status === 'approved' || d.status === 'published').length;
    const made = data.drafts.filter((d) => thisWeek(d.created_at)), failed = runs.filter((r) => r.outcome === 'failed').length;
    return (live ? '' : '<p class="muted">Example figures until you sign in.</p>') +
      '<div class="kpis"><div class="kpi"><span>Waiting for you</span><b>' + w + '</b><small>' + (w === 1 ? 'draft' : 'drafts') + '</small></div><div class="kpi"><span>Written this week</span><b>' + made.length + '</b><small>drafts</small></div><div class="kpi"><span>You approved</span><b>' + approved + '</b><small>this week</small></div><div class="kpi"><span>Shifts</span><b>' + runs.length + '</b><small>' + failed + ' failed this week</small></div></div>' +
      '<div class="panel"><h3>The team</h3><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Employee</th><th>Now</th><th>Last shift</th><th class="num">This week</th><th class="num">Waiting</th></tr></thead><tbody>' +
      data.employees.map((e) => { const st = STATUS[e.status] || STATUS.idle; return '<tr><td><span class="dot" style="background:' + lookOf(e.id).color + '"></span>' + esc(e.name) + '</td><td><span class="dot" style="background:' + st.dot + '"></span>' + st.label + '</td><td>' + (e.last_run_at ? ago(e.last_run_at) + ' ago' : 'Not yet') + '</td><td class="num">' + made.filter((d) => d.employee_id === e.id).length + '</td><td class="num">' + data.drafts.filter((d) => d.employee_id === e.id && d.status === 'awaiting_approval').length + '</td></tr>'; }).join('') +
      '</tbody></table></div></div>' +
      '<div class="panel"><h3>Latest shifts</h3>' + (data.runs.length ? '<ul class="mini-list">' + data.runs.slice(0, 12).map((r) => { const e = byId(r.employee_id); return '<li><span class="dot" style="background:' + lookOf(r.employee_id).color + '"></span><span><b>' + esc(e ? e.name : r.employee_id) + '</b> ' + esc(r.summary || (r.finished_at ? '' : 'On shift now')) + '</span><span class="st">' + esc(r.outcome || 'now') + ' · ' + ago(r.started_at) + '</span></li>'; }).join('') + '</ul>' : '<p class="muted">No shifts yet.</p>') + '</div>';
  }
  drBody.addEventListener('click', (e) => {
    const el = e.target.closest('button'); if (!el) return;
    if (el.dataset.bot) { select(el.dataset.bot, true); openTab('room'); return; }
    if (el.dataset.decide) { doDecide(el.dataset.id, el.dataset.decide); return; }
    if (el.dataset.note) { noteFor = el.dataset.note; openDrafts.add(noteFor); renderDrawer(true); const ta = $('note-' + noteFor); if (ta) ta.focus(); return; }
    if (el.dataset.cancelNote) { noteFor = null; renderDrawer(true); return; }
    if (el.dataset.signout) doSignOut();
  });
  drBody.addEventListener('submit', async (e) => {
    e.preventDefault(); if (e.target.id !== 'signin-form') return;
    const email = $('f-email').value.trim(); if (!email) return;
    try { await signIn(email); linkSent = email; renderDrawer(); } catch (err) { toast(err.message); }
  });

  // ---------------------------------------------------------------- the owner's actions
  async function doDecide(id, decision) {
    if (busy) return;
    const ta = $('note-' + id), note = ta ? ta.value.trim() : '';
    if (decision === 'sent_back' && !note) { toast('Add a note so they know what to change'); if (ta) ta.focus(); return; }
    const words = { approved: 'Approved', sent_back: 'Sent back with your note', rejected: 'Rejected' };
    busy = true;
    try {
      if (live) { await decide(id, decision, note); noteFor = null; await refresh(true); }
      else { const d = data.drafts.find((x) => x.id === id); Object.assign(d, { status: decision, owner_note: note || null, decided_at: new Date().toISOString(), updated_at: new Date().toISOString() }); noteFor = null; renderAll(); }
      toast(words[decision] + (live ? '' : ' (example only: sign in to decide for real)'));
      renderDrawer(true);
    } catch (err) { toast(err.message); } finally { busy = false; }
  }
  async function togglePause() {
    const e = byId(selected); if (!e || busy) return;
    const pausing = !e.paused, name = e.name;
    busy = true;
    try {
      if (live) { await setPaused(e.id, pausing); await refresh(true); }
      else { e.paused = pausing; e.status = pausing ? 'paused' : 'idle'; e.current_task = pausing ? 'Paused by the owner' : 'Ready for the next shift'; renderAll(); }
      toast(pausing ? name + ' is paused and will skip shifts until you resume' : name + ' will work again at the next shift');
    } catch (err) { toast(err.message); } finally { busy = false; }
  }
  async function doSignOut() { await signOut(); window.location.reload(); }
  $('pause').addEventListener('click', togglePause);
  $('work').addEventListener('click', () => openTab('board'));
  $('acct').addEventListener('click', () => { if (live || hq.email) doSignOut(); else openTab('yes'); });

  // ---------------------------------------------------------------- camera controls
  let following = false, spinning = false;
  const setFollowBtn = (v) => { following = v; $('follow').setAttribute('aria-pressed', String(v)); $('follow').textContent = v ? 'Following' : 'Follow'; };
  $('follow').addEventListener('click', () => { setFollowBtn(!following); room.setFollow(following); });
  document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => {
    room.setView(b.dataset.view); setFollowBtn(false);
    document.querySelectorAll('[data-view]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  }));
  $('spin').addEventListener('click', () => { spinning = !spinning; room.setSpin(spinning); $('spin').setAttribute('aria-pressed', String(spinning)); });
  function applySky(name) {
    room.setSky(name);
    $('sky').setAttribute('aria-label', name === 'evening' ? 'Switch to morning' : 'Switch to evening');
    $('skyIcon').src = name === 'evening' ? '/stickers/sun.png' : '/stickers/moon.png';
  }
  $('sky').addEventListener('click', () => applySky(room.sky === 'evening' ? 'morning' : 'evening'));
  const hr = new Date().getHours(); applySky(hr >= 6 && hr < 18 ? 'morning' : 'evening');

  // ---------------------------------------------------------------- keep up with the team
  let refreshing = false, again = null;
  async function refresh(force) {
    if (!live) return;
    if (refreshing) { again = again === true || !!force; return; }
    refreshing = true;
    try { data = await fetchAll(); renderAll(); } catch (err) { console.warn('Little Faith Bots refresh failed', err); }
    finally { refreshing = false; if (again !== null) { const f = again; again = null; refresh(f); } }
  }
  if (live) {
    setInterval(() => { if (!document.hidden) refresh(); }, POLL_MS);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  }

  // boot: wait for the fonts so the signs in the room use them
  const go = () => {
    selected = (data.employees.find((e) => e.status === 'working') || data.employees[0] || {}).id;
    renderAll();
    $('loading').hidden = true;
  };
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(go, go); else go();
}
