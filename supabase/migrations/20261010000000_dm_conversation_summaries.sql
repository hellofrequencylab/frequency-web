-- Messages unread + last-message under-count fix (final-scan patch list). The inbox previously
-- fetched recent messages across ALL conversations under one shared budget (limit convIds*20), so a
-- busy thread could starve others -> a real thread showing lastMessage=null / unread=0. This RPC
-- returns, per conversation, the newest message + the caller's unread count via per-conversation
-- LATERAL joins (no shared budget, no starvation). Caller derived from auth.uid(); it only ever
-- returns conversations the caller participates in (cp.profile_id = me), so it cannot leak others'
-- threads. Read-only, STABLE, authenticated-executable.

create or replace function public.dm_conversation_summaries(_convs uuid[])
returns table (
  conversation_id uuid,
  last_id uuid,
  last_body text,
  last_sender uuid,
  last_created_at timestamptz,
  unread_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    cp.conversation_id,
    lm.id, lm.body, lm.sender_id, lm.created_at,
    coalesce(uc.cnt, 0)
  from public.conversation_participants cp
  left join lateral (
    select m.id, m.body, m.sender_id, m.created_at
    from public.messages m
    where m.conversation_id = cp.conversation_id
    order by m.created_at desc
    limit 1
  ) lm on true
  left join lateral (
    select count(*) as cnt
    from public.messages m
    where m.conversation_id = cp.conversation_id
      and m.sender_id <> cp.profile_id
      and (cp.last_read_at is null or m.created_at > cp.last_read_at)
  ) uc on true
  where cp.profile_id = (select id from public.profiles where auth_user_id = auth.uid())
    and cp.conversation_id = any(_convs);
$$;

revoke all on function public.dm_conversation_summaries(uuid[]) from public;
revoke all on function public.dm_conversation_summaries(uuid[]) from anon;
grant execute on function public.dm_conversation_summaries(uuid[]) to authenticated;
grant execute on function public.dm_conversation_summaries(uuid[]) to service_role;
