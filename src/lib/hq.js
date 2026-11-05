// Talks to the shared workspace in Supabase: sign-in, loading the team, and the
// owner's two actions (decide on a draft, pause or resume an employee).

import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

const sb = SUPABASE_URL && SUPABASE_KEY ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;

function must(res) {
  if (res.error) throw new Error(res.error.message || 'Something went wrong talking to the workspace');
  return res.data;
}

export async function fetchAll() {
  const [employees, drafts, runs] = await Promise.all([
    sb.from('hq_employees').select('*').order('sort'),
    sb.from('hq_drafts')
      .select('id, employee_id, kind, title, slug, body, verses, source_ids, campaign, scheduled_for, status, review, owner_note, revision, created_at, updated_at, decided_at, decided_by')
      .order('updated_at', { ascending: false }).limit(400),
    sb.from('hq_runs').select('*').order('started_at', { ascending: false }).limit(200)
  ]);
  return { employees: must(employees), drafts: must(drafts), runs: must(runs) };
}

// Decide how the office opens: the live team for a signed-in owner, otherwise the demo.
export async function connect() {
  if (!sb) return { mode: 'demo', reason: 'unconfigured' };
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return { mode: 'demo', reason: 'signed_out' };
  const email = session.user.email;
  const owner = await sb.rpc('hq_is_owner');
  if (owner.error) return { mode: 'demo', reason: 'error', email, error: owner.error.message };
  if (!owner.data) return { mode: 'demo', reason: 'not_owner', email };
  return { mode: 'live', email, data: await fetchAll() };
}

export async function signIn(email) {
  const redirect = window.location.origin + window.location.pathname;
  must(await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: redirect } }));
}

export async function signOut() {
  await sb.auth.signOut();
}

export async function decide(draftId, decision, note) {
  return must(await sb.rpc('hq_decide', { p_draft: draftId, p_decision: decision, p_note: note || null }));
}

export async function setPaused(employeeId, paused) {
  return must(await sb.rpc('hq_set_paused', { p_employee: employeeId, p_paused: paused }));
}

export const configured = !!sb;
