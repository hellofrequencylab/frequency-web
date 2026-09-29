-- WHO DID WHAT TO A PLAN (PROG-CAL7 Together, item 3 · LIVE-543).
--
-- On a Plan two Spaces work, who moved a date, who finished a to-do and who changed the stage was
-- nowhere recorded: the Vera change log (space_vera_changes, 20270345008200) records what Vera
-- applied and nothing a person did by hand, and it is keyed by batch, not by Plan. This is the
-- Plan's own record. Every door that changes a Plan writes ONE row here after its change lands,
-- best effort: a row that fails to write is logged and never fails the change it describes.
--
-- WHO MAY READ AND WRITE: the host Space and a guest holding an ACCEPTED share, through the two
-- SECURITY DEFINER helpers 20270345007300 cut the recursion with. Insert is signed by the session:
-- the actor is the caller's own profile, from a Space the caller may write. No policy body reads
-- another RLS table directly.
--
-- NO UPDATE POLICY AND NO DELETE POLICY, the way the Vera log has none: the record is kept by the
-- database, not by a habit of the code. There is no take-back either; an activity row is a fact
-- about what a door did, not a sentence a person wrote.
--
-- APPLY AFTER MERGE, never before (docs/DATABASE.md): execute_sql for this DDL, then the ledger
-- insert at this file's own version.
--
-- ROLLBACK:
--   drop table if exists public.space_plan_activity;

create table if not exists public.space_plan_activity (
  id                uuid primary key default gen_random_uuid(),
  plan_id           uuid not null references public.space_plans(id) on delete cascade,
  actor_profile_id  uuid references public.profiles(id) on delete set null,
  -- The Space the actor acted from: the host or an accepted guest. The other team reads it as
  -- "which side", beside the actor, because a profile may not be readable across the wall.
  actor_space_id    uuid not null references public.spaces(id) on delete cascade,
  kind              text not null check (kind in (
                      'stage', 'date_added', 'date_moved', 'todo_added', 'todo_done', 'todo_assigned',
                      'shared', 'share_answered', 'share_revoked', 'field', 'comment'
                    )),
  -- The sentence as the door reported it, in the house voice. Never rebuilt from the row.
  summary           text not null check (char_length(btrim(summary)) between 1 and 500),
  created_at        timestamptz not null default now()
);

comment on table public.space_plan_activity is
  'One row per change a door made to a Space Plan (PROG-CAL7 item 3, LIVE-543): who, from which Space, what kind, and the sentence the door reported. Read by the host and an accepted guest through the 20270345007300 share helpers. Append only: no update or delete policy exists.';
comment on column public.space_plan_activity.kind is
  'A closed set: stage, date_added, date_moved, todo_added, todo_done, todo_assigned, shared, share_answered, share_revoked, field, comment. todo_assigned is written by LIVE-544.';
comment on column public.space_plan_activity.summary is
  'The sentence the door reported when it made the change, in the house voice.';

create index if not exists space_plan_activity_plan_idx
  on public.space_plan_activity (plan_id, created_at desc);
create index if not exists space_plan_activity_actor_idx
  on public.space_plan_activity (actor_profile_id);
create index if not exists space_plan_activity_space_idx
  on public.space_plan_activity (actor_space_id);

alter table public.space_plan_activity enable row level security;

drop policy if exists space_plan_activity_read on public.space_plan_activity;
create policy space_plan_activity_read on public.space_plan_activity
  for select using (
    private.can_write_plan_host(plan_id)
    or private.plan_is_shared_with_me(plan_id)
    or private.get_my_web_role() in ('admin', 'janitor')
  );

drop policy if exists space_plan_activity_insert on public.space_plan_activity;
create policy space_plan_activity_insert on public.space_plan_activity
  for insert with check (
    (
      private.can_write_plan_host(plan_id)
      or private.plan_is_shared_with_me(plan_id)
    )
    and private.can_write_space_content(actor_space_id)
    and actor_profile_id = private.get_my_profile_id()
  );

-- No update policy and no delete policy: see the header.

revoke all on table public.space_plan_activity from anon;
