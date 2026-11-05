# Agent HQ

A 3D office where you watch, manage and report on your AI employees. It is the
front end for the Little Faith Club AI sales team: each employee shows up as a
person on the office floor, and the Task board, Assigned board, Weekly goals and
Reports show what the team is doing.

This first version is the design: the office, the town around it and the
manager tools, running on example data. The AI employees come next (see
"What comes next").

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

Everything in `src/data/` is example data. Tasks and goals edited in the app are
saved in that browser only (localStorage).

## What comes next

The plan is in the doc "Little Faith Club AI sales team plan". In short:

1. Brand foundation: a shared brand skill, statement of faith, offers and
   prices, and the World English Bible text.
2. Shared workspace in Supabase (content, pins, emails, leads, tasks,
   approvals, metrics, employee status) and Agent HQ reading from it instead of
   `src/data/`.
3. The first four employees in draft-only mode: Content Producer, Pinterest
   and SEO Marketer, Email Marketer, Faith and Brand Reviewer.
4. An approval queue in Agent HQ, so nothing reaches customers without your yes.

## Notes

- three.js is pinned to 0.128.0 so the lighting and colors match the design.
  Newer versions changed how lights and colors work; upgrade deliberately.
- The fonts load from Google Fonts (Fredoka).
- All art is drawn in code; there are no image assets.
