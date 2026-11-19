# The shared workspace

All five employees work in one Supabase database, and Little Faith Bots shows it to the
owner. Use the **Supabase connector** (`execute_sql`) on project
`zyhmbbewqmplceycarfr`. You connect as the database owner, so nothing stops
you from writing anywhere. The rules below are what keep you safe.

## Tables you may use

| Table | What it holds | You may |
|---|---|---|
| `hq_employees` | One row per employee: status, current task, paused | Update **your own row only** |
| `hq_catalogue` | The app's stories, verses, songs, prayers, routines, faith nights | Read only |
| `hq_drafts` | Everything the team writes | Insert; update your own drafts |
| `hq_runs` | One row per scheduled run | Insert and finish your own run |
| `hq_owners` | Owner emails | Never touch |

**Never read or write any `lfc_*` table.** Those hold the families' app data,
including children's details. Never change the schema, never delete rows.

## Every run starts the same way

```sql
-- 1. Am I paused?
select paused from hq_employees where id = '<me>';
```

If `paused` is true: log a skipped run and stop. Do nothing else.

```sql
insert into hq_runs (employee_id, outcome, finished_at, summary)
values ('<me>', 'skipped', now(), 'Paused by the owner');
```

Otherwise open the run and show yourself as working in the office:

```sql
insert into hq_runs (employee_id) values ('<me>') returning id;
update hq_employees
   set status = 'working', current_task = '<what you are doing, in a few words>', last_run_at = now()
 where id = '<me>';
```

Update `current_task` as you move between jobs, so the owner sees it live.

## Every run ends the same way

```sql
update hq_runs
   set finished_at = now(), outcome = '<ok|partial|failed>', summary = '<one or two plain sentences>'
 where id = '<run id>';
```

Then set your office status:

- `waiting`, task `Waiting for you: N drafts to approve`, if any of your
  drafts are `awaiting_approval`;
- otherwise `break`, task `Next run <day> <time>`, if your calendar still has
  work;
- otherwise `idle`, task `Nothing to do until new work arrives`.

If anything fails halfway, still finish the run with `outcome = 'failed'` and a
summary of what went wrong, and set your status to `idle`.

## How a draft moves

```
 you write it ──► in_review ──► reviewer ──► awaiting_approval ──► owner ──► approved ──► published
                     ▲             │                                 │
                     └── sent_back ◄┴─────────── sent_back ◄─────────┤
                                                                     └──► rejected (finished)
```

- You insert drafts as `in_review`.
- Ruth (reviewer) moves them to `awaiting_approval` or `sent_back`, with her
  checks in `review`.
- The owner approves, sends back with `owner_note`, or rejects, from Little Faith Bots.
- `published` is set later, when a connected channel actually posts or sends.
  Nobody on the team publishes yet.

**Always deal with your sent-back drafts first.** Read `review.notes` and
`owner_note`, fix the draft, then:

```sql
update hq_drafts
   set body = $b$<new body json>$b$::jsonb,
       verses = $v$<verses json>$v$::jsonb,
       title = '<title>',
       status = 'in_review',
       revision = revision + 1,
       review = null
 where id = '<draft id>' and employee_id = '<me>' and status = 'sent_back';
```

Keep `owner_note` (the reviewer reads it to check you fixed what the owner
asked). Don't create a new draft for a revision.

## Writing a draft

```sql
insert into hq_drafts (employee_id, kind, title, slug, body, verses, source_ids, campaign, scheduled_for)
values ('<me>', '<kind>', '<title>', '<slug>',
        $b$<body json>$b$::jsonb,
        $v$[{"id": "ps56-3", "text": "When I am afraid, I will put my trust in you."}]$v$::jsonb,
        array['verse:ps56-3', 'story:storm'],
        'advent-2026', '2026-11-29')
returning id;
```

- Use dollar quoting (`$b$ ... $b$`) so apostrophes in the copy don't break
  the SQL. Make sure the JSON is valid.
- `slug`: lowercase words joined by hyphens. A slug is unique per kind, so
  check first: `select id, status from hq_drafts where kind = '<kind>' and slug = '<slug>';`
  If one exists and isn't rejected, don't write another.
- `verses`: every Bible verse quoted anywhere in the draft, as
  `{id, text}`, where `id` is the catalogue verse id without `verse:` and
  `text` is copied **character for character** from
  `hq_catalogue.data->>'text'` (curly apostrophes and all). If a verse isn't in
  the catalogue, don't quote it.
- `source_ids`: the catalogue ids (`story:storm`) and draft ids the draft
  builds on.

### Copying a verse

```sql
select id, title, data->>'text' as text, data->>'theme' as theme, free
  from hq_catalogue where kind = 'verse' order by id;
```

Paste `text` exactly as returned. Write the reference as it appears in `title`
(e.g. `Psalm 56:3`), followed by ` (WEB)` the first time on a page or email.

## Body shapes

Each kind of draft has a fixed `body` shape so Little Faith Bots can show it and a
channel can publish it later. Keep to these keys.

### `landing_page` (Cora)

```json
{
  "path": "/verses/psalm-56-3",
  "meta_title": "Psalm 56:3 for kids: a free printable memory verse",
  "meta_description": "≤155 characters, plain sentence with the main keyword",
  "keywords": ["psalm 56:3 for kids", "bible verse for scared kids"],
  "headline": "When I am afraid",
  "subhead": "One line on what the parent gets",
  "hero_image_brief": "What the illustration shows, in brand style",
  "sections": [
    {"heading": "Why this verse helps at bedtime", "text": "2–4 short paragraphs, separated by blank lines"}
  ],
  "lead_magnet": {"title": "Free printable verse card", "what_it_is": "One sentence", "button": "Send me the card"},
  "cta": {"text": "Try Little Faith Club free", "offer": "free"},
  "related": ["story:storm", "prayer:worry"]
}
```

`cta.offer` is one of `free`, `plus_annual`, `plus_monthly`, `founding`,
`gift_year`, `pack`, `storybook`, `bundle`.

### `pin` (Piper)

```json
{
  "landing_draft_id": "<uuid of the landing page draft>",
  "link_path": "/verses/psalm-56-3",
  "board": "Bible Verses for Kids",
  "title": "≤100 characters, keyword first",
  "description": "≤500 characters, 2–3 plain sentences, keywords woven in, no hashtags",
  "alt_text": "≤500 characters, describes the image for people who can't see it",
  "keywords": ["psalm 56:3 for kids", "bedtime bible verse"],
  "image_brief": "What the pin image shows and the words on it (≤8 words)",
  "variant": 1
}
```

### `email` (Ellie)

```json
{
  "series": "sunday | welcome | advent | offer",
  "step": 1,
  "audience": "all_free | all_subscribers | plus | new_subscribers",
  "send_at": "2026-11-29T18:00:00-05:00",
  "subject": "≤50 characters",
  "preheader": "≤90 characters",
  "blocks": [
    {"type": "greeting", "text": "..."},
    {"type": "story", "source_id": "story:storm", "heading": "...", "text": "...", "link_path": "/stories/storm"},
    {"type": "verse", "source_id": "verse:ps56-3", "heading": "...", "text": "..."},
    {"type": "prayer", "source_id": "prayer:worry", "text": "..."},
    {"type": "activity", "heading": "...", "text": "..."},
    {"type": "offer", "offer": "plus_annual", "heading": "...", "text": "...", "button": "...", "link_path": "/plus"},
    {"type": "sign_off", "text": "..."}
  ],
  "footer": "You're getting this because you signed up at Little Faith Club. {{unsubscribe}}"
}
```

Every email's footer contains `{{unsubscribe}}`. At most one `offer` block.

### `blog_post` (Janna)

A suggestion goes straight to `awaiting_approval` (it skips Ruth). Once
published, Janna adds `stage`, `pr_url` and `published_on`.

```json
{
  "stage": "suggestion | published",
  "path": "/blog/advent-with-toddlers/",
  "search_question": "How do I do Advent with a toddler?",
  "description": "≤170 characters, with the search phrase",
  "why_now": "One line on the timing or the trend",
  "source_url": "https://…",
  "source_title": "Site: page title",
  "outline": ["5 or 6 headings, as the questions parents ask"],
  "links_to": "/free/ (routine charts)",
  "pr_url": "https://github.com/DexterD-0811/little-faith-club/pull/…",
  "published_on": "2026-11-20"
}
```

### `video_script` (later, for the Short Video Producer)

```json
{"length_seconds": 45, "hook": "...", "scenes": [{"seconds": 5, "visual": "...", "voiceover": "...", "on_screen": "..."}], "caption": "...", "link_path": "/stories/storm"}
```

## The review field (Ruth writes this)

```json
{
  "passed": true,
  "reviewed_at": "2026-11-05T10:00:00+08:00",
  "revision": 1,
  "checks": {
    "scripture": "ok", "faith": "ok", "voice": "ok", "facts_prices": "ok",
    "privacy": "ok", "format": "ok", "owner_note_addressed": "n/a"
  },
  "notes": ["Short, specific instruction for each fix"],
  "for_owner": ["Things only the owner can decide, e.g. a missing price"],
  "needs_pastor": false
}
```

## Things to look up

```sql
-- what's already been written (avoid repeats)
select kind, slug, title, status, campaign, scheduled_for from hq_drafts order by created_at desc limit 100;

-- the catalogue, by kind
select id, title, ref, free, data from hq_catalogue where kind = 'story';
```
