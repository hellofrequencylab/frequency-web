-- FIND A TIME (LIVE-2531, hub plan 2026-11-24). A Plan's Pencil it in holds up to three candidate
-- dates (space_calendar_entries rows sharing one option_group), but until now only the person who
-- pencilled them could tell which one works. This table holds one answer per person per candidate:
-- yes, if need be (`maybe`), or no. lib/calendar/time-votes.ts ranks the candidates from these rows
-- (yes first, then if need be, then fewest no), so the best option shows first.
--
-- WHO A VOTE BELONGS TO. Exactly one of two voters:
--   voter_profile_id  a member of the Space's team, voting from the Plan in the app. Written on the
--                     caller's own session, so the RLS below is the lock.
--   voter_email       an outside collaborator with no account (EMAIL-092), voting from a signed,
--                     expiring link in their email. Written ONLY by the server after it has verified
--                     that link (lib/calendar/time-vote-token.ts), through the service role, which
--                     RLS does not bind. No policy here admits an email vote from a session.
-- One answer per voter per candidate (the two partial unique indexes), so changing your mind is an
-- update, never a second row.
--
-- ACCESS. The Space's team reads every vote on its own calendar (the ADR-923 operator helper
-- private.can_write_space_content, the same lock as space_calendar_entries). A team member writes,
-- changes and takes back only their OWN vote, and only on a live candidate of their own Space.
-- Anon reaches nothing. Written as literal statements so scripts/check-rls.mjs can see each one.
--
-- House style: additive + idempotent (SAFE to re-run). Reached untyped until lib/database.types.ts
-- regenerates (ADR-246). Rollback: drop table public.space_calendar_time_votes.

create table if not exists public.space_calendar_time_votes (
  id                uuid primary key default gen_random_uuid(),
  space_id          uuid not null references public.spaces(id) on delete cascade,
  entry_id          uuid not null references public.space_calendar_entries(id) on delete cascade,
  voter_profile_id  uuid references public.profiles(id) on delete cascade,
  voter_email       text check (voter_email is null or (char_length(voter_email) between 3 and 320 and voter_email = lower(voter_email))),
  voter_name        text check (voter_name is null or char_length(voter_name) <= 120),
  choice            text not null check (choice in ('yes', 'maybe', 'no')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint space_calendar_time_votes_one_voter check ((voter_profile_id is null) <> (voter_email is null))
);

comment on table public.space_calendar_time_votes is
  'Find a time (LIVE-2531): one yes / if need be / no per person per candidate date of a Plan. Team reads; a member writes only their own; email votes come from the server after a signed link (EMAIL-092).';
comment on column public.space_calendar_time_votes.choice is
  'yes | maybe (shown as "If need be") | no.';
comment on column public.space_calendar_time_votes.voter_email is
  'An outside collaborator voting from an email link, lower-cased. Set only by the server, never by a session.';

create unique index if not exists space_calendar_time_votes_member_uniq
  on public.space_calendar_time_votes (entry_id, voter_profile_id) where voter_profile_id is not null;
create unique index if not exists space_calendar_time_votes_email_uniq
  on public.space_calendar_time_votes (entry_id, voter_email) where voter_email is not null;
create index if not exists space_calendar_time_votes_space_idx
  on public.space_calendar_time_votes (space_id);
create index if not exists space_calendar_time_votes_voter_idx
  on public.space_calendar_time_votes (voter_profile_id) where voter_profile_id is not null;

drop trigger if exists space_calendar_time_votes_set_updated_at on public.space_calendar_time_votes;
create trigger space_calendar_time_votes_set_updated_at
  before update on public.space_calendar_time_votes
  for each row execute function public.set_updated_at();

alter table public.space_calendar_time_votes enable row level security;

drop policy if exists space_calendar_time_votes_team_read on public.space_calendar_time_votes;
create policy space_calendar_time_votes_team_read on public.space_calendar_time_votes
  for select using (
    private.can_write_space_content(space_id)
    or private.get_my_web_role() in ('admin', 'janitor')
  );

drop policy if exists space_calendar_time_votes_own_insert on public.space_calendar_time_votes;
create policy space_calendar_time_votes_own_insert on public.space_calendar_time_votes
  for insert with check (
    voter_profile_id = private.get_my_profile_id()
    and voter_email is null
    and private.can_write_space_content(space_id)
    and exists (
      select 1 from public.space_calendar_entries e
       where e.id = entry_id
         and e.space_id = space_calendar_time_votes.space_id
         and e.removed_at is null
    )
  );

drop policy if exists space_calendar_time_votes_own_update on public.space_calendar_time_votes;
create policy space_calendar_time_votes_own_update on public.space_calendar_time_votes
  for update
  using (voter_profile_id = private.get_my_profile_id() and private.can_write_space_content(space_id))
  with check (voter_profile_id = private.get_my_profile_id() and voter_email is null and private.can_write_space_content(space_id));

drop policy if exists space_calendar_time_votes_own_delete on public.space_calendar_time_votes;
create policy space_calendar_time_votes_own_delete on public.space_calendar_time_votes
  for delete using (voter_profile_id = private.get_my_profile_id());

revoke all on table public.space_calendar_time_votes from anon;
