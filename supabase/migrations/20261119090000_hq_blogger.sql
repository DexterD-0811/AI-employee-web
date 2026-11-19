-- Janna, the Blogger: a fifth employee who suggests blog posts for the Little Faith Club website and,
-- once the owner approves one in Little Faith Bots, writes it and merges it into the website repository.
-- Her drafts are a new kind, blog_post (body shape in agents/shared/WORKSPACE.md).

alter table public.hq_drafts drop constraint if exists hq_drafts_kind_check;
alter table public.hq_drafts add constraint hq_drafts_kind_check
  check (kind in ('landing_page', 'pin', 'email', 'video_script', 'blog_post'));

insert into public.hq_employees (id, name, role, status, current_task, look, sort)
values ('blogger', 'Janna', 'Blogger', 'idle', 'Starts tomorrow: 3 blog ideas by 8 AM', '{"shirt": "#e9a93a"}'::jsonb, 5)
on conflict (id) do nothing;
