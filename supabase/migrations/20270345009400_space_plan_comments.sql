-- COMMENTS ON A PLAN AND ITS TO-DOS (PROG-CAL7 Together, item 2 · LIVE-542).
--
-- Two teams working one Plan had nowhere to talk about it: no table held a comment on a Plan or
-- on one of its to-dos (the only comments table, listing_comments, is keyed by a marketplace
-- listing). This is the thread. Additive + idempotent; nothing here is member-visible copy.
--
-- WHO MAY READ AND WRITE: the host Space, and a guest Space holding an ACCEPTED share, through
-- the same two SECURITY DEFINER helpers 20270345007300 cut the 42P17 recursion with
-- (private.can_write_plan_host, private.plan_is_shared_with_me). No policy body here reads another
-- RLS table directly, so scripts/check-rls-recursion.mjs sees no edge out of this table. A
-- pending offer opens nothing: the guest reads the thread only once it has said yes.
--
-- NO UPDATE POLICY, ON PURPOSE. A comment the other Space has read is a record, and the record is
-- not rewritten. The author may TAKE BACK their own comment (removed_at, removed_by) through the
-- one function below, which touches those two columns and nothing else, so the body a co-host
-- read is never edited underneath them. There is no delete policy either: a taken-back comment
-- stays as a tombstone the thread can name.
--
-- APPLY AFTER MERGE, never before (docs/DATABASE.md): execute_sql for this DDL, then the ledger
-- insert at this file's own version. The 2026-09-28 drift on #2938 is why that sentence is here.
--
-- ROLLBACK:
--   drop function if exists public.remove_plan_comment(uuid);
--   drop table if exists public.space_plan_comments;

create table if not exists public.space_plan_comments (
  id                 uuid primary key default gen_random_uuid(),
  plan_id            uuid not null references public.space_plans(id) on delete cascade,
  -- Null: a comment on the Plan itself. Set: a comment under one of its to-dos.
  task_id            uuid references public.crm_tasks(id) on delete cascade,
  -- The Space the author wrote from: the host or an accepted guest. Both teams read it as
  -- "who said this", beside the author, because a profile may not be readable across the wall.
  space_id           uuid not null references public.spaces(id) on delete cascade,
  author_profile_id  uuid references public.profiles(id) on delete set null,
  body               text not null check (char_length(btrim(body)) between 1 and 4000),
  created_at         timestamptz not null default now(),
  removed_at         timestamptz,
  removed_by         uuid references public.profiles(id) on delete set null
);

comment on table public.space_plan_comments is
  'The thread under a Space Plan and under each of its to-dos (PROG-CAL7 item 2, LIVE-542). Read and written by the host Space and by an accepted guest through the 20270345007300 share helpers. No update policy: the author may take back their own through remove_plan_comment(), nothing else changes a written comment.';
comment on column public.space_plan_comments.task_id is
  'Null for the Plan thread; a crm_tasks id for the thread under one to-do.';
comment on column public.space_plan_comments.space_id is
  'The Space the author wrote from (host or accepted guest), so the other team can name the side.';

create index if not exists space_plan_comments_plan_idx
  on public.space_plan_comments (plan_id, created_at);
create index if not exists space_plan_comments_task_idx
  on public.space_plan_comments (task_id, created_at) where task_id is not null;
create index if not exists space_plan_comments_author_idx
  on public.space_plan_comments (author_profile_id);
create index if not exists space_plan_comments_removed_by_idx
  on public.space_plan_comments (removed_by) where removed_by is not null;
create index if not exists space_plan_comments_space_idx
  on public.space_plan_comments (space_id);

alter table public.space_plan_comments enable row level security;

-- Read: the host, an accepted guest, or platform staff.
drop policy if exists space_plan_comments_read on public.space_plan_comments;
create policy space_plan_comments_read on public.space_plan_comments
  for select using (
    private.can_write_plan_host(plan_id)
    or private.plan_is_shared_with_me(plan_id)
    or private.get_my_web_role() in ('admin', 'janitor')
  );

-- Write: the same two sides, as themselves, from a Space they may write, and never pre-removed.
drop policy if exists space_plan_comments_insert on public.space_plan_comments;
create policy space_plan_comments_insert on public.space_plan_comments
  for insert with check (
    (
      private.can_write_plan_host(plan_id)
      or private.plan_is_shared_with_me(plan_id)
    )
    and private.can_write_space_content(space_id)
    and author_profile_id = private.get_my_profile_id()
    and removed_at is null
    and removed_by is null
  );

-- No update policy and no delete policy: see the header.

revoke all on table public.space_plan_comments from anon;

-- The author's one door out: mark their own comment taken back. SECURITY DEFINER because the
-- table has no update policy by design; the function is the whole update surface, and it writes
-- removed_at and removed_by only, for a comment the caller wrote and has not yet taken back.
-- Returns whether a row was marked, so a stranger's id and an already-removed id both read false.
create or replace function public.remove_plan_comment(p_comment_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'private', 'pg_temp'
as $$
declare
  v_profile_id uuid := private.get_my_profile_id();
  v_marked integer;
begin
  if v_profile_id is null or p_comment_id is null then
    return false;
  end if;
  update public.space_plan_comments
  set removed_at = now(), removed_by = v_profile_id
  where id = p_comment_id
    and author_profile_id = v_profile_id
    and removed_at is null;
  get diagnostics v_marked = row_count;
  return v_marked > 0;
end;
$$;

comment on function public.remove_plan_comment(uuid) is
  'The author takes back their own Plan comment (removed_at, removed_by). SECURITY DEFINER because space_plan_comments has no update policy on purpose; this function is the whole update surface and touches those two columns only, for the caller''s own unremoved comment.';

revoke all on function public.remove_plan_comment(uuid) from public, anon;
grant execute on function public.remove_plan_comment(uuid) to authenticated;
