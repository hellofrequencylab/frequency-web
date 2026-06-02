-- =====================================================================
-- RLS convergence — surface 6: the room thread (Phase 2, ADR-056).
--
-- messages/r/[roomId]/page.tsx read the room, its members (joining profiles) and
-- room_messages (joining author profiles) through the service-role admin client.
-- The room + members + messages tables already have the right SELECT policies:
--   • rooms_read           — public/cluster-visibility OR am_room_member
--   • room_members_read    — am_room_member OR public room
--   • room_messages_read   — am_room_member (members-only)
-- so the room/membership/messages reads move to the user client. room_messages is
-- members-only, which means a NON-member previewing a public room no longer sees
-- its messages (owner-approved, consistent with the circle-posts decision); the
-- page shows a "join to see the conversation" panel for them instead.
--
-- The one thing RLS hides is the joined member/author `profiles` (own-row OR
-- crew+/in-region). This DEFINER RPC returns the room's members' PUBLIC profile
-- fields (+ is_admin / joined_at for the sidebar), but ONLY when the caller can
-- actually see the room (mirrors rooms_read: public/cluster visibility, or member
-- for private rooms). Message authors are members, so the same map hydrates the
-- thread. Caller-gated, public fields only.
-- =====================================================================

create or replace function visible_room_member_profiles(_room_id uuid)
returns table (
  id           uuid,
  display_name text,
  handle       text,
  avatar_url   text,
  is_admin     boolean,
  joined_at    timestamptz
)
language sql stable security definer
set search_path = public
as $$
  select pr.id, pr.display_name, pr.handle, pr.avatar_url, rm.is_admin, rm.joined_at
  from room_members rm
  join profiles pr on pr.id = rm.profile_id
  where rm.room_id = _room_id
    and exists (
      select 1 from rooms r
      where r.id = _room_id
        and (
          r.visibility in ('public', 'circle', 'hub', 'nexus', 'outpost')
          or am_room_member(r.id)
        )
    )
  order by rm.joined_at asc
  limit 200;
$$;

revoke all on function visible_room_member_profiles(uuid) from public, anon;
grant execute on function visible_room_member_profiles(uuid) to authenticated;

-- =====================================================================
-- VERIFICATION (run after `supabase db push`, then regen types):
--  A. As a MEMBER of room X: visible_room_member_profiles(X) returns X's members
--     with public fields; room_messages read returns the thread (am_room_member).
--  B. As a NON-member of PUBLIC room X: the RPC still returns X's members (public
--     room is visible), but a room_messages select returns 0 rows (members-only) —
--     the page shows the join panel, not the conversation.
--  C. As a NON-member of PRIVATE room Y: the RPC returns 0 rows and the room read
--     itself is hidden (rooms_read) → notFound.
--  D. Logged out (anon): execute denied (authenticated-only).
-- =====================================================================
