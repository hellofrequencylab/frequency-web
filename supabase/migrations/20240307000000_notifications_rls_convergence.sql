-- =====================================================================
-- RLS convergence — surface 1: notifications (Phase 2 / DEVELOPMENT-MAP Stage A).
--
-- The notification read/mark-read paths in app/(main)/notifications/actions.ts
-- ran through the service-role admin client (bypassing RLS) with a hand-written
-- `recipient_id = me` filter as the only authz. This moves that authz into the
-- database so the user-scoped client enforces it, removing the app-level filter.
--
-- Reads use SECURITY DEFINER RPCs rather than a plain RLS select because the
-- notification row joins the ACTOR's profile, and the `profiles` read policy only
-- lets crew+ read other in-region profiles — so a plain user-client select would
-- null out the actor for sub-crew members and cross-region actors. The RPC scopes
-- strictly to the caller (auth.uid -> profile) and returns only the actor's PUBLIC
-- fields (id, display_name, handle, avatar_url), which are already shown anywhere
-- that person appears. Writes (mark read) move to the user client via a new
-- UPDATE-own policy. INSERTs (other actors notifying you) keep the service-role
-- path — they legitimately write rows you don't own.
--
-- Existing policies (unchanged): "users read own notifications" (select),
-- "service role full access notifications".
-- =====================================================================

-- 1) Let a member mark their OWN notifications read from the user-scoped client.
drop policy if exists "notifications: users update own" on notifications;
create policy "notifications: users update own" on notifications
  for update
  using  (recipient_id = (select id from profiles where auth_user_id = auth.uid() limit 1))
  with check (recipient_id = (select id from profiles where auth_user_id = auth.uid() limit 1));

-- 2) Read RPC: the caller's notifications + the actor's public fields, newest first.
--    Ownership is enforced here (auth.uid -> profile); not logged in -> no rows.
create or replace function my_notifications(_limit integer default 30)
returns table (
  id                 uuid,
  type               text,
  reference_type     text,
  reference_id       uuid,
  body               text,
  read_at            timestamptz,
  created_at         timestamptz,
  actor_id           uuid,
  actor_display_name text,
  actor_handle       text,
  actor_avatar_url   text
)
language sql stable security definer
set search_path = public
as $$
  select n.id, n.type, n.reference_type, n.reference_id, n.body, n.read_at, n.created_at,
         a.id, a.display_name, a.handle, a.avatar_url
  from notifications n
  left join profiles a on a.id = n.actor_id
  where n.recipient_id = (select id from profiles where auth_user_id = auth.uid() limit 1)
  order by n.created_at desc
  limit greatest(1, least(coalesce(_limit, 30), 100));
$$;

-- 3) Read RPC: the caller's unread count.
create or replace function my_unread_notification_count()
returns integer
language sql stable security definer
set search_path = public
as $$
  select count(*)::int
  from notifications
  where recipient_id = (select id from profiles where auth_user_id = auth.uid() limit 1)
    and read_at is null;
$$;

-- Authenticated-only (anon gets no rows anyway; be explicit).
revoke all on function my_notifications(integer) from public, anon;
revoke all on function my_unread_notification_count() from public, anon;
grant execute on function my_notifications(integer) to authenticated;
grant execute on function my_unread_notification_count() to authenticated;

-- =====================================================================
-- VERIFICATION (run after `supabase db push`, then regen types). These confirm
-- the convergence is correctly scoped. Replace the JWTs/ids with real values, or
-- run from two signed-in sessions in the app.
--
--  A. As member U1 (sub-crew): /notifications shows actors on rows even though
--     U1 can't read those profiles directly — proves the DEFINER RPC path.
--  B. RLS isolation (PostgREST, as user U2's JWT):
--       select * from my_notifications();              -- only U2's rows
--       update notifications set read_at = now()
--         where recipient_id = '<U1-profile-id>';      -- 0 rows (policy blocks)
--  C. Logged out (anon): select my_notifications();    -- 0 rows, no error.
-- =====================================================================
