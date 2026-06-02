-- =====================================================================
-- RLS convergence — surface 5: messages (inbox + DM threads) (Phase 2, ADR-056).
--
-- The messages inbox (app/(main)/messages/page.tsx), the DM thread
-- (messages/[id]/page.tsx), and the popover summary (messages/popover-actions.ts)
-- read conversations / conversation_participants / messages / rooms / room_members
-- / room_messages through the service-role admin client. Those tables ALREADY have
-- membership-based SELECT policies (am_participant / am_room_member) plus an
-- UPDATE-own policy for last_read, and profiles allows reading your own row — so
-- the reads + the mark-as-read write move straight to the user-scoped client with
-- NO behaviour change (the app only ever read the caller's own conversations and
-- rooms; now the DB enforces it).
--
-- The ONE thing RLS blocks is the joined `profiles` of the OTHER DM participants
-- (the `profiles` read policy is own-row OR crew+/in-region), which would null the
-- co-participant for sub-crew / cross-region viewers. This DEFINER RPC hydrates
-- only PUBLIC profile fields, scoped to people the caller actually shares a DM
-- conversation or a room with (plus the caller) — caller-scoped, no broadening of
-- profile exposure. It also covers room co-members so the room surfaces (a later
-- follow-up) can reuse it.
--
-- Scope of this surface: the DM inbox + DM thread reads. The ROOM thread
-- (messages/r/[roomId]) is a separate follow-up: its room_messages policy is
-- strictly members-only, so converging it changes the current non-member
-- public-room message preview (a visibility decision), and it stays on admin here.
-- =====================================================================

create or replace function message_peer_profiles()
returns table (
  id           uuid,
  display_name text,
  handle       text,
  avatar_url   text
)
language sql stable security definer
set search_path = public
as $$
  with me as (
    select id as pid from profiles where auth_user_id = auth.uid()
  )
  select pr.id, pr.display_name, pr.handle, pr.avatar_url
  from profiles pr
  where (select pid from me) is not null
    and (
      pr.id = (select pid from me)
      or pr.id in (
        select cp.profile_id
        from conversation_participants cp
        where cp.conversation_id in (
          select conversation_id from conversation_participants
          where profile_id = (select pid from me)
        )
      )
      or pr.id in (
        select rm.profile_id
        from room_members rm
        where rm.room_id in (
          select room_id from room_members where profile_id = (select pid from me)
        )
      )
    );
$$;

revoke all on function message_peer_profiles() from public, anon;
grant execute on function message_peer_profiles() to authenticated;

-- =====================================================================
-- VERIFICATION (run after `supabase db push`, then regen types):
--  A. As user U1 in a DM with U2: message_peer_profiles() includes U2's public
--     fields (and U1's), regardless of U1's role/region — proves the restricted
--     profiles join is restored for sub-crew viewers.
--  B. As user U3 sharing NOTHING with U1: U1 is absent from U3's result — the RPC
--     is strictly caller-scoped (no blanket profile exposure).
--  C. Logged out (anon): execute denied (authenticated-only).
-- =====================================================================
