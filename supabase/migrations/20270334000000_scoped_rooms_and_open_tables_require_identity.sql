-- Scoped rooms and three USING(true) tables stop admitting anon (SCAN-212, ADR-1149, owner ruling).
--
-- 🔴 FINDING 1 — SCOPED ROOMS HAD NO IDENTITY CHECK AT ALL. `rooms_read_public_or_member` read
--     (visibility = 'public') OR (visibility in ('circle','hub','nexus','outpost','channel')) OR am_room_member(id)
-- and that middle branch asks nothing of the caller. `room_messages` and `room_members` carry the
-- same shape for their channel/public branch. Live behaviour measured 2026-08-25: anon reads the one
-- channel room's metadata, and messages/members return 200 [] rather than 42501 — so only EMPTINESS
-- is withholding them today, and `room_messages` is in the realtime publication.
--
-- 🔴 FINDING 2 — THREE TABLES ARE `USING (true)` WITH THE ANON GRANT INTACT: dispatch_poll_votes,
-- spotlight_top_friends, listing_comments. Poll votes carry (profile_id, option_id) on member-only
-- dispatches, which is a de-anonymising pair the moment rows exist.
--
-- ✅ WHY THIS IS FREE, AND THE CHECK THAT MADE IT SAFE TO DO. Every application reader of all three
-- tables goes through `createAdminClient()`, which bypasses RLS entirely:
--     dispatch_poll_votes   app/(main)/nearby/actions.ts, app/(main)/nearby/[id]/page.tsx
--     spotlight_top_friends lib/spotlight/top-friends.ts
--     listing_comments      lib/marketplace/listing-qna-actions.ts, lib/marketplace/listing-comments.ts
-- So these policies serve NO application path — they only widen what the publishable anon key can ask
-- PostgREST for directly. The rooms side is the same story: the one non-admin reader,
-- app/(main)/messages/popover-actions.ts, already calls auth.getUser() and scopes to the caller's own
-- memberships, and app/(main)/channels/[id]/page.tsx uses the admin client.
--
-- ⚠️ THAT CHECK IS THE POINT, not a formality. The events column revoke (20270330000000) nearly went
-- out as a blanket table revoke until app/discover/events/_data.ts turned out to be the ONE anon
-- reader of 245 sites; a blanket revoke would have dark-screened the public events hub. The same
-- question was asked here and the answer came back clean.
--
-- ⚠️ MEASURED BEFORE CHANGING: 1 room (visibility 'channel'), 0 room_messages, 0 room_members,
-- 0 dispatch_poll_votes, 0 spotlight_top_friends, 0 listing_comments. Latent at zero rows, which is
-- exactly when it is cheap — the opposite of every finding in ADR-962/969/1141, all found by their
-- consequence.
--
-- WHAT EACH TABLE BECOMES, and why they are not all the same answer:
--   rooms / room_messages / room_members  the scoped branches now require an authenticated caller.
--       Genuinely 'public' rooms stay open to anon, and membership still grants what it always did.
--       Identity, not membership, because browsing a circle's rooms before joining is a real flow and
--       there is no data here to tell me whether it is used — requiring membership might break
--       discovery, and this row is about closing an anon hole rather than redesigning room visibility.
--   dispatch_poll_votes                   your OWN vote. Aggregates already come from the admin
--       client, so nothing needs to read another member's (profile_id, option_id) pair through RLS.
--   spotlight_top_friends                 the OWNER's own rows. The public spotlight surface renders
--       through the admin client.
--   listing_comments                      authenticated. It is public-adjacent community content on
--       public listings, so owner-scoping it would be wrong rather than merely strict; what it stops
--       is a signed-out bulk enumeration of every comment on every listing.
--
-- ROLLBACK: re-create each policy with its previous predicate (recorded in the header above).

begin;

-- ── Rooms ────────────────────────────────────────────────────────────────────────────────────────
drop policy if exists "rooms_read_public_or_member" on public.rooms;
create policy "rooms_read_public_or_member" on public.rooms
for select using (
  visibility = 'public'
  or private.am_room_member(id)
  or (
    (select auth.uid()) is not null
    and visibility = any (array['circle', 'hub', 'nexus', 'outpost', 'channel'])
  )
);

drop policy if exists "room_messages_read_members" on public.room_messages;
create policy "room_messages_read_members" on public.room_messages
for select using (
  private.am_room_member(room_id)
  or (
    (select auth.uid()) is not null
    and exists (select 1 from public.rooms r where r.id = room_messages.room_id and r.visibility = 'channel')
  )
);

drop policy if exists "room_members_read" on public.room_members;
create policy "room_members_read" on public.room_members
for select using (
  private.am_room_member(room_id)
  or (
    (select auth.uid()) is not null
    and exists (
      select 1 from public.rooms r
      where r.id = room_members.room_id and r.visibility = any (array['public', 'channel'])
    )
  )
);

-- ── The three USING(true) tables ─────────────────────────────────────────────────────────────────
drop policy if exists "anyone can read poll votes" on public.dispatch_poll_votes;
create policy "members read their own poll vote" on public.dispatch_poll_votes
for select using (profile_id = private.get_my_profile_id());

drop policy if exists "spotlight_top_friends_read" on public.spotlight_top_friends;
create policy "spotlight_top_friends_read" on public.spotlight_top_friends
for select using (
  owner_profile_id = private.get_my_profile_id()
  or private.get_my_web_role() = any (array['admin', 'janitor'])
);

drop policy if exists "listing_comments_select" on public.listing_comments;
create policy "listing_comments_select" on public.listing_comments
for select to authenticated using (true);

-- ── Defence in depth: remove the anon GRANT where no anon path exists ────────────────────────────
-- The difference is legible in the response. A policy the caller misses returns 200 [] — the very
-- shape this row criticised ("only EMPTINESS is withholding them"). Removing the GRANT makes the same
-- refusal arrive as 42501, a fact about permission rather than about how many rows happen to exist.
--
-- ⚠️ public.rooms KEEPS its anon SELECT on purpose: the policy above deliberately leaves
-- `visibility = 'public'` readable by anon, and revoking the grant would take that branch with it.
-- Taking exactly enough is the discipline 20270330000000 was written about.
revoke select on public.room_messages         from anon;
revoke select on public.room_members          from anon;
revoke select on public.dispatch_poll_votes   from anon;
revoke select on public.spotlight_top_friends from anon;
revoke select on public.listing_comments      from anon;

-- PROVE IT AS ANON, both ways, in this transaction. A tightening that also broke the genuinely public
-- read would be a regression rather than a fix.
--
-- ⚠️ THE NEGATIVE HALF NEEDS NO POPULATION and is asserted unconditionally: `row_security_active` and
-- a direct policy read answer honestly on an empty table, whereas "select returned 0 rows" would not
-- — 0 rows is what an empty table returns to an ALLOWED reader too. That confusion is the defect
-- 20270330000000 and 20270331000000 both shipped in their first versions.
do $$
declare v_bad text;
begin
  -- Every policy that used to be USING(true) must now carry a real predicate.
  select string_agg(tablename || '.' || policyname, ', ')
    into v_bad
    from pg_policies
   where schemaname = 'public'
     and cmd = 'SELECT'
     and qual = 'true'
     and tablename in ('dispatch_poll_votes', 'spotlight_top_friends');
  if v_bad is not null then
    raise exception 'still USING(true) for anon: %', v_bad;
  end if;

  -- listing_comments keeps `true` but must be scoped TO authenticated, so anon cannot reach it.
  if exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'listing_comments'
       and policyname = 'listing_comments_select'
       and 'anon' = any (roles)
  ) then
    raise exception 'listing_comments_select still admits anon';
  end if;

  -- The scoped-room branches must mention auth.uid(); a policy that lost it is the original bug back.
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'rooms'
       and policyname = 'rooms_read_public_or_member'
       and qual like '%auth.uid()%'
  ) then
    raise exception 'rooms_read_public_or_member no longer requires identity for scoped rooms';
  end if;

  -- POSITIVE: a genuinely public room must still be anon-readable, or this took too much.
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'rooms'
       and policyname = 'rooms_read_public_or_member'
       and qual like '%public%'
  ) then
    raise exception 'rooms_read_public_or_member dropped its public branch, so anon lost genuinely public rooms';
  end if;

  -- The grant half, both directions.
  select string_agg(table_name, ', ')
    into v_bad
    from information_schema.role_table_grants
   where table_schema = 'public' and grantee = 'anon' and privilege_type = 'SELECT'
     and table_name in ('room_messages', 'room_members', 'dispatch_poll_votes',
                        'spotlight_top_friends', 'listing_comments');
  if v_bad is not null then
    raise exception 'anon still holds SELECT on: %', v_bad;
  end if;

  if not exists (
    select 1 from information_schema.role_table_grants
     where table_schema = 'public' and grantee = 'anon'
       and privilege_type = 'SELECT' and table_name = 'rooms'
  ) then
    raise exception 'anon lost SELECT on public.rooms, so genuinely public rooms are unreachable - this took too much';
  end if;
end $$;

commit;
