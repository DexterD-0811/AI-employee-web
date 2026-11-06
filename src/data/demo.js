// Example data for the team room when nobody is signed in. Same shape as the Supabase rows
// (hq_employees, hq_drafts, hq_runs), so the page works the same way in both modes.

const ago = (min) => new Date(Date.now() - min * 60000).toISOString();
const look = (shirt) => ({ shirt });
const passed = (forOwner) => ({ passed: true, checks: { scripture: 'ok', faith: 'ok', voice: 'ok', facts_prices: 'ok', privacy: 'ok', format: 'ok', owner_note_addressed: 'n/a' }, notes: [], for_owner: forOwner || [], needs_pastor: false });

export function demoData() {
  return {
    employees: [
      { id: 'content', name: 'Cora', role: 'Content Producer', status: 'break', current_task: 'Next run Mon 8:43', paused: false, last_run_at: ago(1440), look: look('#6a4c8e'), sort: 1, updated_at: ago(1440) },
      { id: 'pinterest', name: 'Piper', role: 'Pinterest and SEO Marketer', status: 'working', current_task: 'Writing 3 pins for Psalm 56:3', paused: false, last_run_at: ago(4), look: look('#ee8f78'), sort: 2, updated_at: ago(4) },
      { id: 'email', name: 'Ellie', role: 'Email Marketer', status: 'break', current_task: 'Next run Thu 1:45', paused: false, last_run_at: ago(1440), look: look('#5e9c76'), sort: 3, updated_at: ago(1440) },
      { id: 'reviewer', name: 'Ruth', role: 'Faith and Brand Reviewer', status: 'working', current_task: 'Checking Piper’s pins', paused: false, last_run_at: ago(2), look: look('#6f9fc2'), sort: 4, updated_at: ago(2) }
    ],
    drafts: [
      {
        id: 'demo-page', employee_id: 'content', kind: 'landing_page', title: 'Psalm 56:3 for scared nights', slug: 'verse-psalm-56-3', status: 'awaiting_approval', revision: 1, campaign: null, scheduled_for: null,
        body: { path: '/verses/psalm-56-3', headline: 'When I am afraid', subhead: 'A short verse your little one can hold on to when the lights go out.', sections: [{ heading: 'A verse small enough for small hands', text: 'Psalm 56:3 is one sentence long, which makes it just right for little ones.\n\n“When I am afraid, I will put my trust in you.” Psalm 56:3 (WEB)' }, { heading: 'Try it tonight', text: 'Read Jesus Calms the Storm together in the app. It’s free and takes about 3 minutes.' }], lead_magnet: { title: 'Free Psalm 56:3 verse card', what_it_is: 'A printable bedside card.', button: 'Send me the card' }, cta: { text: 'Try Little Faith Club free' }, meta_title: 'Psalm 56:3 for kids: a bedtime verse for scared nights', meta_description: 'A free printable Psalm 56:3 verse card and a simple bedtime routine.' },
        review: passed(['The free card uses the worry prayer, which is a Plus prayer. Happy to give it away?']), owner_note: null, created_at: ago(1500), updated_at: ago(1300), decided_at: null
      },
      {
        id: 'demo-email', employee_id: 'email', kind: 'email', title: 'Sunday 8 Nov: God made everything', slug: 'sunday-2026-11-08', status: 'awaiting_approval', revision: 1, campaign: null, scheduled_for: '2026-11-08',
        body: { subject: 'This week: God made everything', preheader: 'A 4-minute story, one verse and a little walk outside', send_at: '2026-11-08T18:00:00-05:00', blocks: [{ type: 'greeting', text: 'Hi there, November is here and the leaves are putting on their best show of the year.' }, { type: 'verse', heading: 'Say it together', text: '“In the beginning, God created the heavens and the earth.” Genesis 1:1 (WEB)' }], footer: 'You’re getting this because you signed up at Little Faith Club. {{unsubscribe}}' },
        review: passed(), owner_note: null, created_at: ago(1500), updated_at: ago(1301), decided_at: null
      },
      { id: 'demo-pin-1', employee_id: 'pinterest', kind: 'pin', title: 'Psalm 56:3 for kids: a verse for scared nights', status: 'in_review', revision: 1, body: { title: 'Psalm 56:3 for kids: a verse for scared nights', description: 'A one-line verse your little one can hold on to at bedtime.', board: 'Bible Verses for Kids', link_path: '/verses/psalm-56-3', image_brief: 'A child holding a parent’s hand by a night light.' }, review: null, created_at: ago(6), updated_at: ago(6), decided_at: null },
      { id: 'demo-pin-2', employee_id: 'pinterest', kind: 'pin', title: 'Free printable Psalm 56:3 verse card', status: 'in_review', revision: 1, body: { title: 'Free printable Psalm 56:3 verse card' }, review: null, created_at: ago(5), updated_at: ago(5), decided_at: null }
    ],
    runs: [
      { id: 'r1', employee_id: 'reviewer', started_at: ago(2), finished_at: null, outcome: null, summary: 'Checking Piper’s pins' },
      { id: 'r2', employee_id: 'pinterest', started_at: ago(8), finished_at: ago(3), outcome: 'ok', summary: 'Wrote 2 pins for the Psalm 56:3 page.' },
      { id: 'r3', employee_id: 'reviewer', started_at: ago(1300), finished_at: ago(1299), outcome: 'ok', summary: 'Reviewed 2: both passed to you, with one question about a prayer.' },
      { id: 'r4', employee_id: 'content', started_at: ago(1500), finished_at: ago(1499), outcome: 'ok', summary: 'Wrote the Psalm 56:3 page.' },
      { id: 'r5', employee_id: 'email', started_at: ago(1500), finished_at: ago(1499), outcome: 'ok', summary: 'Wrote the Sunday 8 Nov email.' }
    ]
  };
}
