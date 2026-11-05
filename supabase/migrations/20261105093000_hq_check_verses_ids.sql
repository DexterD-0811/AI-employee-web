-- catalogue ids carry a kind prefix (verse:ps56-3); drafts list verses by their plain id (ps56-3)
create or replace function public.hq_check_verses(p_draft uuid)
returns table (verse_id text, ok boolean, expected text, quoted text)
language sql stable set search_path = '' as $$
  select v ->> 'id',
         c.data ->> 'text' is not null and c.data ->> 'text' = v ->> 'text',
         c.data ->> 'text',
         v ->> 'text'
  from public.hq_drafts d
  cross join lateral jsonb_array_elements(d.verses) v
  left join public.hq_catalogue c
         on c.kind = 'verse'
        and c.id = 'verse:' || regexp_replace(v ->> 'id', '^verse:', '')
  where d.id = p_draft
$$;
revoke all on function public.hq_check_verses(uuid) from public, anon, authenticated;
