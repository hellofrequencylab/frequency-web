-- Threads on any item, live and with unread state (LIVE-2527, LIVE-2528).
-- See docs/BUILD-BACKLOG.json for status; this file explains the work, it does not track it.
--
-- A Space team talks about a Plan, a to-do or a calendar entry in public.space_plan_comments
-- (20270345009400), which also carries the cross-Space share rules a Plan needs. Events, deals and
-- contacts had no team thread at all. This adds:
--
-- 1. public.item_comments: one thread table for the Space-owned items that had none, keyed by
--    (subject_type, subject_id). The row's space_id must be the Space that owns the subject
--    (private.item_subject_in_space), and only that Space's team reads or writes it. Same shape and
--    same "no update policy, take back through a function" rule as space_plan_comments.
-- 2. public.thread_reads: one row per person per thread, the last time they read it, across BOTH
--    thread tables (a Plan thread is subject_type 'plan'), so an unread line is one compare.
-- 3. Live delivery by Broadcast from the database, Supabase's recommended pattern: an AFTER INSERT
--    trigger on each thread table sends a small payload (no body) to the private topic
--        thread:<subject_type>:<subject_id>
--    and the open thread refetches through its normal RLS read. A realtime.messages SELECT policy
--    lets a signed-in member join only a thread topic they can read. No INSERT policy: members
--    cannot publish, only the trigger (as owner) can.
--
-- Additive and idempotent. ROLLBACK:
--   drop trigger if exists trg_broadcast_item_comment on public.item_comments;
--   drop trigger if exists trg_broadcast_plan_comment on public.space_plan_comments;
--   drop function if exists private.broadcast_thread_message();
--   drop policy if exists "realtime: a member receives the threads they can read" on realtime.messages;
--   drop function if exists private.can_read_thread_topic(text);
--   drop function if exists public.remove_item_comment(uuid);
--   drop table if exists public.thread_reads;
--   drop table if exists public.item_comments;
--   drop function if exists private.item_subject_in_space(text, uuid, uuid);

-- ── 1. Does this item belong to this Space? ─────────────────────────────────────────────────────
-- SECURITY DEFINER so the check reads the subject's owner whatever the caller can see of it; it
-- answers yes/no only. An event belongs to the Space that hosts it or the Space it is listed under.
create or replace function private.item_subject_in_space(p_type text, p_id uuid, p_space uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case p_type
    when 'event'   then exists (select 1 from public.events e where e.id = p_id and (e.space_id = p_space or e.host_space_id = p_space))
    when 'deal'    then exists (select 1 from public.crm_deals d where d.id = p_id and d.space_id = p_space)
    when 'contact' then exists (select 1 from public.contacts c where c.id = p_id and c.space_id = p_space)
    else false
  end
$$;

revoke all on function private.item_subject_in_space(text, uuid, uuid) from public, anon;
grant execute on function private.item_subject_in_space(text, uuid, uuid) to authenticated;

-- ── 2. The thread table ─────────────────────────────────────────────────────────────────────────
create table if not exists public.item_comments (
  id                 uuid primary key default gen_random_uuid(),
  subject_type       text not null check (subject_type in ('event', 'deal', 'contact')),
  subject_id         uuid not null,
  space_id           uuid not null references public.spaces(id) on delete cascade,
  author_profile_id  uuid references public.profiles(id) on delete set null,
  body               text not null check (char_length(btrim(body)) between 1 and 4000),
  created_at         timestamptz not null default now(),
  removed_at         timestamptz,
  removed_by         uuid references public.profiles(id) on delete set null
);

comment on table public.item_comments is
  'The team thread under an event, a deal or a contact (LIVE-2527). Plans, to-dos and calendar entries keep theirs in space_plan_comments, which carries the cross-Space share rules. Read and written by the owning Space''s team only. No update policy: the author takes back their own through remove_item_comment().';

create index if not exists item_comments_subject_idx on public.item_comments (subject_type, subject_id, created_at);
create index if not exists item_comments_space_idx on public.item_comments (space_id);
create index if not exists item_comments_author_idx on public.item_comments (author_profile_id);
create index if not exists item_comments_removed_by_idx on public.item_comments (removed_by) where removed_by is not null;

alter table public.item_comments enable row level security;

drop policy if exists item_comments_read on public.item_comments;
create policy item_comments_read on public.item_comments
  for select using (
    private.can_write_space_content(space_id)
    or private.get_my_web_role() in ('admin', 'janitor')
  );

drop policy if exists item_comments_insert on public.item_comments;
create policy item_comments_insert on public.item_comments
  for insert with check (
    private.can_write_space_content(space_id)
    and private.item_subject_in_space(subject_type, subject_id, space_id)
    and author_profile_id = private.get_my_profile_id()
    and removed_at is null
    and removed_by is null
  );

revoke all on table public.item_comments from anon;

create or replace function public.remove_item_comment(p_comment_id uuid)
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
  update public.item_comments
  set removed_at = now(), removed_by = v_profile_id
  where id = p_comment_id
    and author_profile_id = v_profile_id
    and removed_at is null;
  get diagnostics v_marked = row_count;
  return v_marked > 0;
end;
$$;

comment on function public.remove_item_comment(uuid) is
  'The author takes back their own item comment (removed_at, removed_by). The whole update surface of item_comments, which has no update policy on purpose.';

revoke all on function public.remove_item_comment(uuid) from public, anon;
grant execute on function public.remove_item_comment(uuid) to authenticated;

-- ── 3. What each person has read ────────────────────────────────────────────────────────────────
-- One row per person per thread. A Plan's thread (its own and its to-dos') is subject_type 'plan';
-- the rest name the item. Own rows only.
create table if not exists public.thread_reads (
  profile_id    uuid not null references public.profiles(id) on delete cascade,
  subject_type  text not null check (subject_type in ('plan', 'task', 'entry', 'event', 'deal', 'contact')),
  subject_id    uuid not null,
  last_read_at  timestamptz not null default now(),
  primary key (profile_id, subject_type, subject_id)
);

comment on table public.thread_reads is
  'When each person last read each item thread (LIVE-2528), across space_plan_comments and item_comments. A message newer than last_read_at is unread. Own rows only.';

alter table public.thread_reads enable row level security;

drop policy if exists thread_reads_own_select on public.thread_reads;
create policy thread_reads_own_select on public.thread_reads
  for select using (profile_id = private.get_my_profile_id());

drop policy if exists thread_reads_own_insert on public.thread_reads;
create policy thread_reads_own_insert on public.thread_reads
  for insert with check (profile_id = private.get_my_profile_id());

drop policy if exists thread_reads_own_update on public.thread_reads;
create policy thread_reads_own_update on public.thread_reads
  for update using (profile_id = private.get_my_profile_id())
  with check (profile_id = private.get_my_profile_id());

drop policy if exists thread_reads_own_delete on public.thread_reads;
create policy thread_reads_own_delete on public.thread_reads
  for delete using (profile_id = private.get_my_profile_id());

revoke all on table public.thread_reads from anon;

-- ── 4. Live delivery ────────────────────────────────────────────────────────────────────────────
-- Who may join a thread topic: the same people who may read the thread. A Plan thread follows the
-- Plan's host and share rules; an item thread follows the owning Space's team.
create or replace function private.can_read_thread_topic(p_topic text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_parts text[];
  v_type text;
  v_id uuid;
begin
  if p_topic is null or p_topic not like 'thread:%' then
    return false;
  end if;
  v_parts := string_to_array(p_topic, ':');
  if array_length(v_parts, 1) <> 3 then
    return false;
  end if;
  v_type := v_parts[2];
  begin
    v_id := v_parts[3]::uuid;
  exception when others then
    return false;
  end;
  if v_type = 'plan' then
    return private.can_write_plan_host(v_id) or private.plan_is_shared_with_me(v_id);
  elsif v_type in ('event', 'deal', 'contact') then
    return (
      case v_type
        when 'event'   then exists (select 1 from public.events e where e.id = v_id and (private.can_write_space_content(e.space_id) or (e.host_space_id is not null and private.can_write_space_content(e.host_space_id))))
        when 'deal'    then exists (select 1 from public.crm_deals d where d.id = v_id and private.can_write_space_content(d.space_id))
        when 'contact' then exists (select 1 from public.contacts c where c.id = v_id and private.can_write_space_content(c.space_id))
        else false
      end
    );
  end if;
  return false;
end;
$$;

revoke all on function private.can_read_thread_topic(text) from public, anon;
grant execute on function private.can_read_thread_topic(text) to authenticated;

-- The publish. SECURITY DEFINER so the insert into realtime.messages runs as the owner whatever
-- role wrote the comment; it can never fail a comment write (realtime.send downgrades its own
-- errors to a WARNING and the call is wrapped again here). The payload names the thread and the
-- new row only: the listener refetches through RLS, so no body ever rides the socket.
create or replace function private.broadcast_thread_message()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_type text;
  v_id uuid;
begin
  if tg_table_name = 'space_plan_comments' then
    v_type := 'plan';
    v_id := new.plan_id;
  else
    v_type := new.subject_type;
    v_id := new.subject_id;
  end if;
  begin
    perform realtime.send(
      jsonb_build_object('id', new.id, 'subject_type', v_type, 'subject_id', v_id),
      'message',
      'thread:' || v_type || ':' || v_id::text,
      true
    );
  exception when others then
    raise warning 'broadcast_thread_message: %', sqlerrm;
  end;
  return new;
end;
$$;

revoke execute on function private.broadcast_thread_message() from public, anon, authenticated;

drop trigger if exists trg_broadcast_item_comment on public.item_comments;
create trigger trg_broadcast_item_comment
  after insert on public.item_comments
  for each row execute function private.broadcast_thread_message();

drop trigger if exists trg_broadcast_plan_comment on public.space_plan_comments;
create trigger trg_broadcast_plan_comment
  after insert on public.space_plan_comments
  for each row execute function private.broadcast_thread_message();

drop policy if exists "realtime: a member receives the threads they can read" on realtime.messages;
create policy "realtime: a member receives the threads they can read"
  on realtime.messages
  for select
  to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and (select realtime.topic()) like 'thread:%'
    and (select private.can_read_thread_topic((select realtime.topic())))
  );
