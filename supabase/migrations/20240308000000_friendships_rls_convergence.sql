-- =====================================================================
-- RLS convergence — surface 2: friendships (Phase 2, ADR-056).
--
-- The friends list (app/(main)/friends/page.tsx) read friendships + the other
-- party's profile through the service-role admin client. This moves it onto the
-- user-scoped client via a SECURITY DEFINER RPC (same reasoning as surface 1:
-- the read joins profiles, which the profiles policy hides from sub-crew/
-- cross-region viewers — so a plain RLS select would null the friend's name).
-- The RPC scopes to the caller (auth.uid -> profile) and returns only the other
-- party's PUBLIC fields. Friendship write policies (request/accept/remove) already
-- exist (friendships_insert_self_request / _update_addressee_accept / _delete_own),
-- so friend-actions can converge later without a new migration.
-- =====================================================================

create or replace function my_friendships()
returns table (
  friendship_id      uuid,
  status             text,
  i_requested        boolean,
  requested_at       timestamptz,
  other_id           uuid,
  other_display_name text,
  other_handle       text,
  other_avatar_url   text
)
language sql stable security definer
set search_path = public
as $$
  with me as (select id from profiles where auth_user_id = auth.uid() limit 1)
  select f.id,
         f.status::text,
         (f.requested_by = (select id from me)) as i_requested,
         f.requested_at,
         o.id, o.display_name, o.handle, o.avatar_url
  from friendships f
  join me on (me.id = f.user_a_id or me.id = f.user_b_id)
  join profiles o
    on o.id = (case when f.user_a_id = (select id from me) then f.user_b_id else f.user_a_id end)
  order by f.requested_at desc;
$$;

revoke all on function my_friendships() from public, anon;
grant execute on function my_friendships() to authenticated;

-- =====================================================================
-- VERIFICATION (run after `supabase db push`, then regen types):
--  A. As a member U1 (sub-crew): /friends shows friends' names/avatars even
--     though U1 can't read those profiles directly — proves the DEFINER path.
--  B. As U2 (PostgREST with U2's JWT): select * from my_friendships();
--     -> only friendships where U2 is a party; never anyone else's.
--  C. Logged out (anon): select my_friendships(); -> 0 rows, no error.
-- =====================================================================
