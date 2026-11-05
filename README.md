# Agent HQ

A 3D office where you watch, manage and report on your AI employees. It is the
front end for the Little Faith Club AI sales team: each employee shows up as a
person on the office floor, and the Task board, Assigned board, Weekly goals and
Reports show what the team is doing.

Signed out, it shows a demo office with sample people. Signed in as an owner, it
shows the real team: four AI employees who draft marketing for Little Faith Club,
and an Approvals queue where you approve, send back or reject everything they write.

## Run it

You need Node.js 18 or newer.

```bash
npm install
npm run dev       # open the address it prints, usually http://localhost:5173
npm run build     # production files in dist/
npm run preview   # serve the production build
```

## What's in the office

- **The office floor:** workspace pods, meeting room, coffee room, break room,
  lunch room, manager's office and reception, inside a lot with parking, a
  plaza and a fountain, surrounded by a small town and farmland.
- **People:** each employee has a status (Working, On break, Lunch, Idle,
  Commuting) shown by a ring, a badge and what they are doing: typing,
  drinking coffee, eating, playing ping-pong, walking to their car.
- **Camera:** drag to rotate 360°, right-drag or Shift-drag to pan, scroll or
  pinch to zoom. Presets: Iso, Top, Front, Street, Overview. Follow a person,
  auto-rotate, cut away the walls, hide the town, switch to sharp mode with
  shadows.
- **Manager tools:** status filters, a card for the selected person, and a side
  panel with the Task board, Assigned board, Weekly goals and Reports (Owner,
  Admin and Manager views). The boards standing in the office open the same
  panels.

Keyboard: `Q`/`E` rotate, `1`–`5` views, `R` auto-rotate, `F` follow, `W`
walls, `C` town, arrow keys pan, `Esc` closes the side panel.

## Project layout

```
index.html            page markup: HUD, person card, side panel, camera toolbar
src/styles.css        the game-style UI (cream panels, navy outlines)
src/main.js           the 3D scene, people, animation, camera and side panel logic
src/data/agents.js    the people on the floor and the status list
src/data/boards.js    starting tasks, weekly goals and sample report figures
```

`src/data/` is the demo office. In the demo, tasks and goals you edit are saved
in that browser only (localStorage).

```
src/lib/config.js     Supabase address and publishable key (override with a .env file)
src/lib/hq.js         sign-in, loading the team, approve/send back/reject, pause
src/lib/live.js       turns workspace rows into people, task cards and weekly goals
agents/               the AI employees' playbooks (see below)
supabase/             the workspace tables (migrations) and starting data (seed)
```

## The AI team

Four employees work in draft-only mode. Each is a playbook in this repository
plus a Claude scheduled task that wakes it, reads the playbook and works in the
shared Supabase workspace (project `little-faith-club`).

| Employee | Playbook | Schedule (Manila time) | Writes |
|---|---|---|---|
| Cora, Content Producer | `agents/content-producer/SKILL.md` | Mon–Thu 8:43 | Landing pages, 2 a run |
| Pip, Pinterest and SEO Marketer | `agents/pinterest-marketer/SKILL.md` | Daily 5:41 | 3 pins per page, up to 10 a run |
| Ellie, Email Marketer | `agents/email-marketer/SKILL.md` | Thu 13:45 | Sunday, welcome and seasonal emails, up to 3 a run |
| Ruth, Faith and Brand Reviewer | `agents/brand-reviewer/SKILL.md` | Every 2 hours, 7:45–19:45 | Checks every draft, passes it to you or sends it back |

All four read `agents/brand/BRAND.md` (voice, statement of faith, prices,
privacy) and `agents/shared/WORKSPACE.md` (tables, SQL, draft shapes).

How a draft moves: an employee writes it → Ruth checks Scripture word for word
against the catalogue, faith, voice, prices, privacy and format → it waits in
**Approvals** → you approve, send it back with a note, or reject it. A
sent-back draft goes to the top of its writer's next run. Nothing is published,
posted or emailed; approved drafts wait until the channels are connected.

The **Pause** button on an employee's card (or in Assigned) stops their runs
until you resume them.

To change what an employee does, edit their playbook and push to `main`; the
next run picks it up.

## Live mode setup

1. In the Supabase dashboard for `little-faith-club`, open **Authentication →
   URL Configuration** and add every address you open Agent HQ from to
   **Redirect URLs**, e.g. `http://localhost:5173` and `http://localhost:4173`,
   plus your hosted address once it's deployed. Without this, the sign-in link
   won't come back to Agent HQ.
2. Open Agent HQ, choose **Sign in**, and enter an owner email. Owners are listed
   in the `hq_owners` table.
3. Open the link from the email in the same browser.

The publishable key in `src/lib/config.js` is safe to ship: row-level security
lets only owners read the workspace, and owners change things only through the
`hq_decide` and `hq_set_paused` functions.

To set the workspace up from scratch, run the files in `supabase/migrations/`
in order, then `supabase/seed/hq_seed.sql`, then add an owner:
`insert into hq_owners (email) values ('you@example.com');`

## What comes next

- Connect Brevo so approved emails become campaign drafts, and choose a route
  for pins (Pinterest's API, Tailwind, or posting by hand).
- Replace the working statement of faith in `BRAND.md` with the club's own, and
  settle the two prices the docs disagree on ($39 or $39.99 a year; church
  licence from $99 or $149).
- Add the Sales Analyst and the Church Partnerships Rep.

## Notes

- three.js is pinned to 0.128.0 so the lighting and colors match the design.
  Newer versions changed how lights and colors work; upgrade deliberately.
- The fonts load from Google Fonts (Fredoka).
- All art is drawn in code; there are no image assets.
