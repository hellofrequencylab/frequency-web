-- Deleting a Channel has to take its POLYMORPHIC children with it (ADR-882 follow-up).
--
-- `topical_channels` has exactly two foreign keys pointing at it, and both behave correctly on
-- delete: topical_channel_memberships CASCADEs, and circles.topical_channel_id is SET NULL (a Circle
-- outlives the Channel it practiced and simply stops belonging to one). That is the whole of what
-- the schema knows about.
--
-- But a Channel owns two more things through POLYMORPHIC scope columns, which carry no FK and
-- therefore cannot cascade:
--   * its open room  — rooms WHERE visibility = 'channel' AND scope_id = <channel id>
--   * its forum      — posts WHERE scope_id = <channel id>
-- Deleting the channel row alone would strand both. The room would keep serving at
-- /messages/r/<id>, still postable by anyone holding the link and still listed in the Messages of
-- everyone who had joined it, pointing at a Channel that no longer exists. The forum posts would
-- keep rendering in feeds with an origin lookup that resolves to nothing.
--
-- The app cannot fix this with three sequential deletes: PostgREST gives each its own transaction,
-- so a failure part-way leaves either a Channel with no forum or (worse) an unreachable live room.
-- One SECURITY DEFINER function makes it atomic — all of it, or none of it.
--
-- Deleting the room cascades room_members + room_messages; deleting a post cascades its replies,
-- mentions, and reactions. Both are already the schema's behavior, so this function only has to
-- name the right rows.
--
-- AUTHZ is two locks, and the inner one has a trap worth naming.
--
-- OUTER: only `service_role` holds EXECUTE. Nothing in the app calls this as a signed-in user — the
-- only caller is deleteChannel() in channels/admin-actions.ts, through the admin client — so neither
-- `anon` nor `authenticated` needs the grant, and neither gets it. That keeps a destructive RPC off
-- the public REST surface entirely (`/rest/v1/rpc/delete_topical_channel` is unreachable without the
-- service key) instead of merely guarded on it.
--
-- INNER: the role check below, kept as defense in depth in case a later migration re-grants EXECUTE.
-- The OBVIOUS form of it —
--     if private.get_my_web_role() not in ('admin','janitor') then raise
-- is silently WRONG here. That helper resolves `auth.uid()` and COALESCEs a miss to the string
-- 'none', and the caller that matters holds the SERVICE ROLE and therefore has no auth.uid() at all.
-- The blanket check would have refused the one path this function exists to serve, on every call,
-- while reading as perfectly strict in review. So it is conditional on there BEING an authenticated
-- user: an authenticated caller must be staff, and the service role passes because the server action
-- already re-checked staff before it got here (ADR-274 — the same seam every other admin-client write
-- in that file uses).

create or replace function public.delete_topical_channel(p_channel_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null
     and coalesce(private.get_my_web_role(), 'none') not in ('admin', 'janitor') then
    raise exception 'not authorized to delete a Channel'
      using errcode = '42501';
  end if;

  -- The forum. Replies/mentions/reactions cascade from each post.
  delete from public.posts where scope_id = p_channel_id;

  -- The open room. Members + messages cascade from it. The visibility filter keeps this from ever
  -- matching a same-id room of another kind, even though scope_id is a uuid and cannot collide.
  delete from public.rooms where visibility = 'channel' and scope_id = p_channel_id;

  -- The Channel itself: memberships cascade, and every Circle that practiced here is released
  -- (topical_channel_id -> null) rather than deleted.
  delete from public.topical_channels where id = p_channel_id;
end;
$$;

comment on function public.delete_topical_channel(uuid) is
  'Delete a topical channel atomically with its polymorphic children (open room, forum posts). Staff only for an authenticated caller; the service role is gated by the calling server action. ADR-882.';

revoke all on function public.delete_topical_channel(uuid) from public;
revoke all on function public.delete_topical_channel(uuid) from anon;
revoke all on function public.delete_topical_channel(uuid) from authenticated;
grant execute on function public.delete_topical_channel(uuid) to service_role;
