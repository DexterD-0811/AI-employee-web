-- Agent HQ shared workspace for the AI employees.
-- Lives beside the Little Faith Club app tables (lfc_*) and never touches them.
--
-- Who can do what:
--   * AI employees run as scheduled Claude tasks and write through the Supabase
--     connector (database owner role), so row-level security does not limit them.
--   * People sign in to Agent HQ. Only emails listed in hq_owners can read anything,
--     and owners change drafts and employees only through hq_decide / hq_set_paused.
--   * Anonymous visitors can read nothing.

create table public.hq_owners (
  email      text primary key,
  added_at   timestamptz not null default now()
);

create table public.hq_employees (
  id            text primary key,                 -- content, pinterest, email, reviewer
  name          text not null,                    -- shown on the office floor
  role          text not null,
  status        text not null default 'idle'
                check (status in ('working', 'break', 'idle', 'waiting', 'paused')),
  current_task  text,
  paused        boolean not null default false,
  last_run_at   timestamptz,
  look          jsonb not null default '{}'::jsonb, -- shirt, pants, skin, hair, hairStyle
  sort          int not null default 0,
  updated_at    timestamptz not null default now()
);

create table public.hq_catalogue (
  id          text primary key,                   -- the MVP's own ids, e.g. ps56-3, creation
  kind        text not null
              check (kind in ('story', 'verse', 'song', 'prayer', 'routine', 'faith_night')),
  title       text not null,
  ref         text,                               -- Scripture reference where there is one
  free        boolean not null default false,     -- part of the free tier in the app
  data        jsonb not null,                     -- the MVP record as it stands
  updated_at  timestamptz not null default now()
);

create table public.hq_drafts (
  id            uuid primary key default gen_random_uuid(),
  employee_id   text not null references public.hq_employees(id),
  kind          text not null check (kind in ('landing_page', 'pin', 'email', 'video_script')),
  title         text not null,
  slug          text,
  body          jsonb not null,                   -- shape per kind: agents/shared/WORKSPACE.md
  verses        jsonb not null default '[]'::jsonb, -- [{ "id": "ps56-3", "text": "..." }] for every verse quoted
  source_ids    text[] not null default '{}',     -- catalogue ids and draft ids it builds on
  campaign      text,                             -- e.g. advent-2026
  scheduled_for date,
  status        text not null default 'in_review'
                check (status in ('in_review', 'sent_back', 'awaiting_approval', 'approved', 'rejected', 'published')),
  review        jsonb,                            -- the reviewer's checks and notes
  owner_note    text,                             -- the owner's note when sending back or rejecting
  revision      int not null default 1,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  decided_at    timestamptz,
  decided_by    text
);
create index hq_drafts_status_idx on public.hq_drafts (status, created_at desc);
create index hq_drafts_employee_idx on public.hq_drafts (employee_id, status);
create unique index hq_drafts_slug_kind_idx on public.hq_drafts (kind, slug)
  where slug is not null and status not in ('rejected');

create table public.hq_runs (
  id           uuid primary key default gen_random_uuid(),
  employee_id  text not null references public.hq_employees(id),
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  outcome      text check (outcome in ('ok', 'partial', 'failed', 'skipped')),
  summary      text
);
create index hq_runs_employee_idx on public.hq_runs (employee_id, started_at desc);

-- keep updated_at current
create function public.hq_touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;
create trigger hq_employees_touch before update on public.hq_employees for each row execute function public.hq_touch();
create trigger hq_catalogue_touch before update on public.hq_catalogue for each row execute function public.hq_touch();
create trigger hq_drafts_touch before update on public.hq_drafts for each row execute function public.hq_touch();

-- is the signed-in person an owner?
create function public.hq_is_owner() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.hq_owners o
    where lower(o.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
$$;

-- every verse a draft quotes must match the catalogue word for word
create function public.hq_check_verses(p_draft uuid)
returns table (verse_id text, ok boolean, expected text, quoted text)
language sql stable set search_path = '' as $$
  select v ->> 'id',
         c.data ->> 'text' is not null and c.data ->> 'text' = v ->> 'text',
         c.data ->> 'text',
         v ->> 'text'
  from public.hq_drafts d
  cross join lateral jsonb_array_elements(d.verses) v
  left join public.hq_catalogue c on c.id = v ->> 'id' and c.kind = 'verse'
  where d.id = p_draft
$$;

-- the owner's decision on a draft waiting for approval
create function public.hq_decide(p_draft uuid, p_decision text, p_note text default null)
returns public.hq_drafts
language plpgsql security definer set search_path = '' as $$
declare
  result public.hq_drafts;
begin
  if not public.hq_is_owner() then
    raise exception 'Only an owner can approve, send back or reject drafts';
  end if;
  if p_decision not in ('approved', 'sent_back', 'rejected') then
    raise exception 'Decision must be approved, sent_back or rejected';
  end if;
  if p_decision = 'sent_back' and coalesce(trim(p_note), '') = '' then
    raise exception 'Add a note so the employee knows what to change';
  end if;
  update public.hq_drafts
     set status = p_decision,
         owner_note = nullif(trim(coalesce(p_note, '')), ''),
         decided_at = now(),
         decided_by = auth.jwt() ->> 'email'
   where id = p_draft and status = 'awaiting_approval'
  returning * into result;
  if result.id is null then
    raise exception 'That draft is no longer waiting for approval';
  end if;
  return result;
end $$;

-- pause or resume an employee
create function public.hq_set_paused(p_employee text, p_paused boolean)
returns public.hq_employees
language plpgsql security definer set search_path = '' as $$
declare
  result public.hq_employees;
begin
  if not public.hq_is_owner() then
    raise exception 'Only an owner can pause or resume employees';
  end if;
  update public.hq_employees
     set paused = p_paused,
         status = case when p_paused then 'paused' else 'idle' end,
         current_task = case when p_paused then 'Paused by the owner' else 'Ready for the next scheduled run' end
   where id = p_employee
  returning * into result;
  return result;
end $$;

-- access
alter table public.hq_owners    enable row level security;
alter table public.hq_employees enable row level security;
alter table public.hq_catalogue enable row level security;
alter table public.hq_drafts    enable row level security;
alter table public.hq_runs      enable row level security;

create policy "owners read owners"    on public.hq_owners    for select to authenticated using (public.hq_is_owner());
create policy "owners read employees" on public.hq_employees for select to authenticated using (public.hq_is_owner());
create policy "owners read catalogue" on public.hq_catalogue for select to authenticated using (public.hq_is_owner());
create policy "owners read drafts"    on public.hq_drafts    for select to authenticated using (public.hq_is_owner());
create policy "owners read runs"      on public.hq_runs      for select to authenticated using (public.hq_is_owner());

revoke all on function public.hq_check_verses(uuid) from public, anon, authenticated;
revoke all on function public.hq_decide(uuid, text, text) from public, anon;
revoke all on function public.hq_set_paused(text, boolean) from public, anon;
revoke all on function public.hq_is_owner() from public, anon;
grant execute on function public.hq_decide(uuid, text, text) to authenticated;
grant execute on function public.hq_set_paused(text, boolean) to authenticated;
grant execute on function public.hq_is_owner() to authenticated;
