-- Header Messages badge (mobile-nav follow-up). The header Messages icon needs a LIVE unread
-- total on first paint, but the only existing reads are per-thread (dm_conversation_summaries,
-- 20261010000000) or per-room (room_unread_counts, 20261012000000) and both need the caller to
-- have already fetched their membership id lists. This RPC folds the whole badge into ONE grouped
-- read: the caller's total unread across 1:1 DMs (excluding threads migrated to rooms) PLUS every
-- room they belong to. Caller derived from auth.uid() and scoped to the caller's OWN memberships
-- (cp.profile_id / rm.profile_id = me), so it can never count or leak a thread the caller has not
-- joined. Read-only, STABLE, authenticated-executable. Mirrors the two per-thread RPCs above.
--
-- Unread = messages from someone OTHER than the caller, created after the caller's last_read_at
-- (or all, when never read) — the exact predicate the inbox + popover already use.

create or replace function public.my_unread_message_count()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select id from public.profiles where auth_user_id = auth.uid()
  ),
  dm as (
    select count(*) as c
    from public.conversation_participants cp
    join public.conversations conv
      on conv.id = cp.conversation_id
      and conv.migrated_to_room_id is null
    join public.messages m
      on m.conversation_id = cp.conversation_id
      and m.sender_id <> cp.profile_id
      and (cp.last_read_at is null or m.created_at > cp.last_read_at)
    where cp.profile_id = (select id from me)
  ),
  room as (
    select count(*) as c
    from public.room_members rm
    join public.room_messages msg
      on msg.room_id = rm.room_id
      and msg.author_id <> rm.profile_id
      and (rm.last_read_at is null or msg.created_at > rm.last_read_at)
    where rm.profile_id = (select id from me)
  )
  select (coalesce((select c from dm), 0) + coalesce((select c from room), 0))::int;
$$;

revoke all on function public.my_unread_message_count() from public;
revoke all on function public.my_unread_message_count() from anon;
grant execute on function public.my_unread_message_count() to authenticated;
grant execute on function public.my_unread_message_count() to service_role;
