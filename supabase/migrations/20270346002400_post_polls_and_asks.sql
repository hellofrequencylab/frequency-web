-- The composer offers a Poll and an Ask to every member (LIVE-682).
-- See docs/BUILD-BACKLOG.json for status; this file explains the work, it does not track it.
--
-- 1. Two post kinds. public.post_type gains 'poll' and 'ask'. An Ask is a post that asks the
--    community something (replies are the answers); a Poll is a post with 2 to 6 options. Nothing
--    in the feed RPCs or the posts policies filters on post_type, so both read exactly like a post.
--    (ADD VALUE is not used later in this transaction, which is what Postgres requires.)
-- 2. public.post_poll_options: a poll's options, with a vote_count kept by trigger, so readers get
--    the tally without anyone's vote. RLS: an option is readable when its post is readable to the
--    caller (the posts SELECT policy decides, through the EXISTS). No write policy: options are
--    written by the createPost action (service role) after its own authorisation.
-- 3. public.post_poll_votes: one vote per member per poll (primary key post_id, profile_id). RLS: a
--    member reads only their OWN vote. No write policy: the votePoll action (service role) checks
--    the voter can read the post, then writes.
-- 4. private.post_poll_vote_tally(): keeps vote_count in step on insert / delete. SECURITY DEFINER,
--    search_path pinned, execute revoked from everyone (a trigger needs no grant).
--
-- Additive and idempotent. ROLLBACK (the two enum values cannot be dropped; unused they are inert):
--   drop table if exists public.post_poll_votes; drop table if exists public.post_poll_options;
--   drop function if exists private.post_poll_vote_tally();

alter type public.post_type add value if not exists 'poll';
alter type public.post_type add value if not exists 'ask';

create table if not exists public.post_poll_options (
  id         uuid        primary key default gen_random_uuid(),
  post_id    uuid        not null references public.posts (id) on delete cascade,
  label      text        not null check (char_length(label) between 1 and 80),
  position   smallint    not null check (position between 0 and 5),
  vote_count integer     not null default 0 check (vote_count >= 0),
  created_at timestamptz not null default now(),
  unique (post_id, position)
);

create table if not exists public.post_poll_votes (
  post_id    uuid        not null references public.posts (id) on delete cascade,
  option_id  uuid        not null references public.post_poll_options (id) on delete cascade,
  profile_id uuid        not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, profile_id)
);

create index if not exists post_poll_votes_option_id_idx on public.post_poll_votes (option_id);
create index if not exists post_poll_votes_profile_id_idx on public.post_poll_votes (profile_id);

alter table public.post_poll_options enable row level security;
alter table public.post_poll_votes enable row level security;

drop policy if exists "post_poll_options: read with the post" on public.post_poll_options;
create policy "post_poll_options: read with the post"
  on public.post_poll_options
  for select
  to anon, authenticated
  using (exists (select 1 from public.posts p where p.id = post_poll_options.post_id));

drop policy if exists "post_poll_votes: read your own" on public.post_poll_votes;
create policy "post_poll_votes: read your own"
  on public.post_poll_votes
  for select
  to authenticated
  using (profile_id = (select private.get_my_profile_id()));

revoke all on public.post_poll_options from anon, authenticated;
revoke all on public.post_poll_votes from anon, authenticated;
grant select on public.post_poll_options to anon, authenticated;
grant select on public.post_poll_votes to authenticated;
grant all on public.post_poll_options to service_role;
grant all on public.post_poll_votes to service_role;

create or replace function private.post_poll_vote_tally()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    update public.post_poll_options set vote_count = vote_count + 1 where id = new.option_id;
    return new;
  end if;
  update public.post_poll_options set vote_count = greatest(vote_count - 1, 0) where id = old.option_id;
  return old;
end;
$$;

revoke execute on function private.post_poll_vote_tally() from public, anon, authenticated;

drop trigger if exists trg_post_poll_vote_tally on public.post_poll_votes;
create trigger trg_post_poll_vote_tally
  after insert or delete on public.post_poll_votes
  for each row execute function private.post_poll_vote_tally();
