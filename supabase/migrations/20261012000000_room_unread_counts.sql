-- Messages inbox speed (perf audit P2). The inbox previously counted room unread with an N+1: one
-- `select count(*) from room_messages` per joined room (unbounded — a member in 40 rooms fired 40
-- count queries on every inbox load, only to sum them into one header badge). This RPC folds that
-- into ONE grouped read: per requested room, the caller's unread count (messages from someone else
-- since the caller's last_read_at). Caller derived from auth.uid() and scoped to the caller's OWN
-- memberships (rm.profile_id = me), so it can never count or leak a room the caller has not joined.
-- Read-only, STABLE, authenticated-executable. Mirrors dm_conversation_summaries (20261010000000).

create or replace function public.room_unread_counts(_rooms uuid[])
returns table (
  room_id uuid,
  unread_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    rm.room_id,
    count(msg.id)
  from public.room_members rm
  left join public.room_messages msg
    on msg.room_id = rm.room_id
    and msg.author_id <> rm.profile_id
    and (rm.last_read_at is null or msg.created_at > rm.last_read_at)
  where rm.profile_id = (select id from public.profiles where auth_user_id = auth.uid())
    and rm.room_id = any(_rooms)
  group by rm.room_id;
$$;

revoke all on function public.room_unread_counts(uuid[]) from public;
revoke all on function public.room_unread_counts(uuid[]) from anon;
grant execute on function public.room_unread_counts(uuid[]) to authenticated;
grant execute on function public.room_unread_counts(uuid[]) to service_role;
