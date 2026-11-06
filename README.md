# Little Faith Bots

The team room for the Little Faith Club AI team. Four AI employees, drawn as
little robots in the Little Faith Club sticker style, work at desks in one 3D
room. You can see who is on shift, what each one is writing, what is waiting for
your yes, and how the week is going.

Signed out, it shows an example team. Signed in as an owner, it shows the real
team from the Supabase workspace and refreshes every 30 seconds.

## Run it

You need Node.js 18 or newer.

```bash
npm install
npm run dev       # open the address it prints, usually http://localhost:5173
npm run build     # production files in dist/
npm run preview   # serve the production build
```

## What's in the room

- **Desks:** one per employee, with a screen showing what they're writing
  (pins, a page, an email, Ruth's checks), a status light and their mug.
- **Where a bot is tells you its status:**

  | Status | Where | What you see |
  |---|---|---|
  | On shift | At the desk | Typing, screen on |
  | Waiting for you | At the desk | Standing and waving |
  | On break | Tea nook | Asleep on the sofa, next shift shown |
  | Nothing to do | Tea nook | Resting with a cup of tea |
  | Paused | At the desk | Screen dark, lights off |

- **The wall:** the work board (Being fixed, With Ruth, Your yes, Approved),
  a real-time clock and today's shifts.
- **Your desk** by the door, with a gold tray of drafts that need your yes.
  Pages fly along the route from the writer to Ruth to you.
- **Pip the lamb**, the club mascot, near the door. (The Pinterest marketer is
  Piper, a different character.)

Tap a bot for its card: what it's doing, its next shift, **Follow**, **Pause**
or **Resume**, and **Her work** / **His work**. The tab bar opens **Your yes**
(approve, send back with a note, or reject), **Work board**, **This week**
(goals as handprints) and **Reports**.

Camera: drag to turn, pinch or scroll to zoom, or use **Team room**, **From
above** and **Close up**. The round buttons spin the room and switch evening and
daytime light. With the room focused, the arrow keys turn and tilt, `+`/`-`
zoom, and `Esc` closes a panel.

## Project layout

```
index.html            page markup: greeting card, bot card, yes card, tab bar, panel
src/styles.css        Little Faith Club look (cream cards, navy, gold, Fredoka/Nunito)
src/scene.js          the 3D team room: room, desks, bots, boards, sky, camera
src/main.js           the app: data, cards, panels, approvals, pause, refresh
src/data/demo.js      the example team shown when signed out
src/lib/config.js     Supabase address, publishable key, owner's first name
src/lib/hq.js         sign-in, loading the team, approve/send back/reject, pause
src/lib/live.js       turns workspace rows into board columns, goals and dates
public/stickers/      sticker art from the Little Faith Club app
agents/               the AI employees' playbooks (see below)
supabase/             the workspace tables (migrations) and starting data (seed)
```

You can override the config with a `.env` file: `VITE_SUPABASE_URL`,
`VITE_SUPABASE_PUBLISHABLE_KEY` and `VITE_OWNER_NAME` (the name in the
greeting).

## The AI team

Four employees work in draft-only mode. Each is a playbook in this repository
plus a Claude scheduled task that wakes it, reads the playbook and works in the
shared Supabase workspace (project `little-faith-club`).

| Employee | Playbook | Schedule (Manila time) | Writes |
|---|---|---|---|
| Cora, Content Producer | `agents/content-producer/SKILL.md` | Mon–Thu 8:43 | Landing pages, 2 a run |
| Piper, Pinterest and SEO Marketer | `agents/pinterest-marketer/SKILL.md` | Daily 5:41 | 3 pins per page, up to 10 a run |
| Ellie, Email Marketer | `agents/email-marketer/SKILL.md` | Thu 13:45 | Sunday, welcome and seasonal emails, up to 3 a run |
| Ruth, Faith and Brand Reviewer | `agents/brand-reviewer/SKILL.md` | Every 2 hours, 7:45–19:45 | Checks every draft, passes it to you or sends it back |

All four read `agents/brand/BRAND.md` (voice, statement of faith, prices,
privacy) and `agents/shared/WORKSPACE.md` (tables, SQL, draft shapes).

How a draft moves: an employee writes it → Ruth checks Scripture word for word
against the catalogue, faith, voice, prices, privacy and format → it waits in
**Your yes** → you approve, send it back with a note, or reject it. A
sent-back draft goes to the top of its writer's next run. Nothing is published,
posted or emailed; approved drafts wait until the channels are connected.

The **Pause** button on an employee's card stops their runs
until you resume them.

To change what an employee does, edit their playbook and push to `main`; the
next run picks it up.

## Live mode setup

1. In the Supabase dashboard for `little-faith-club`, open **Authentication →
   URL Configuration** and add every address you open Little Faith Bots from to
   **Redirect URLs**, e.g. `http://localhost:5173` and `http://localhost:4173`,
   plus your hosted address once it's deployed. Without this, the sign-in link
   won't come back to Little Faith Bots.
2. Open Little Faith Bots, choose **Sign in**, and enter an owner email. Owners are listed
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

- three.js is pinned to 0.128.0 so the toon shading and colors match the
  design. Newer versions changed how lights and colors work; upgrade
  deliberately.
- The fonts load from Google Fonts (Fredoka, Nunito, Andika).
- The room, bots and boards are drawn in code; the only images are the
  stickers in `public/stickers/`.
