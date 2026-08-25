-- public.rooms loses the anon SELECT grant that no migration ever created (SCAN-212 follow-up, ADR-1150).
--
-- 🔴 WHAT WENT WRONG ONE MIGRATION AGO. 20270334000000 revoked anon's SELECT on five tables and
-- deliberately spared a sixth, public.rooms, on the reasoning that the policy's `visibility = 'public'`
-- branch exists to serve anonymous readers and that revoking the grant would take that branch with it.
-- It then asserted that reasoning as a positive control: "anon lost SELECT on public.rooms ... this
-- took too much".
--
-- ✅ `db-tests` FAILED THAT CONTROL, AND THE CONTROL WAS THE THING THAT WAS WRONG. On a fresh apply of
-- every migration in this repo, anon does not hold SELECT on public.rooms — because no migration here
-- has ever granted it. Production's copy is vestigial, predating the tracked chain. So the sparing
-- was not "taking exactly enough"; it was leaving one over-grant in place on the strength of a premise
-- nobody had measured, which is ADR-1082 in its purest form.
--
-- ✅ THE MEASUREMENT THAT SHOULD HAVE COME FIRST — every caller of public.rooms, 2026-08-25:
--     app/(main)/channels/[id]/page.tsx          admin client (service_role, bypasses RLS + grants)
--     app/(main)/channels/[id]/manage/load.ts    admin client
--     app/(main)/messages/page.tsx               `if (!user) redirect('/sign-in')`
--     app/(main)/messages/r/[roomId]/page.tsx    `if (!user) redirect('/sign-in')`
--     app/(main)/messages/actions.ts             server actions, authenticated
--     app/(main)/messages/rooms/actions.ts       server actions, authenticated (delete via admin)
--     app/(main)/messages/popover-actions.ts     both entry points call auth.getUser() and bail on null
-- There is no anonymous reader of public.rooms. The grant serves only what the publishable anon key
-- can ask PostgREST for directly, which is the exact surface 20270334000000 set out to close.
--
-- ⚠️ WHAT THIS DOES **NOT** TOUCH. The `visibility = 'public'` branch of `rooms_read_public_or_member`
-- stays. It is not an anon affordance and never was: it is what lets an AUTHENTICATED member see a
-- public room they have not joined, which is the discovery flow the branch was written for. That
-- branch plus authenticated's SELECT grant is the whole of what the application uses, and both are
-- asserted below.
--
-- ⚠️ MEASURED BEFORE CHANGING: 1 room, visibility 'channel'. There is not a single row with
-- visibility 'public' in production today, so even the branch this migration was once afraid of
-- losing has never returned a row to anyone.
--
-- ROLLBACK: `grant select on public.rooms to anon;`

begin;

-- The before-picture, captured before the revoke. Every "this took too much" control below compares
-- against THIS rather than against a grant named in the file, for the reason this whole migration
-- exists: an absolute assertion measures the environment, a before/after comparison measures the
-- change.
create temp table _auth_grants_before on commit drop as
select table_name
  from information_schema.role_table_grants
 where table_schema = 'public' and grantee = 'authenticated' and privilege_type = 'SELECT'
   and table_name in ('rooms', 'room_messages', 'room_members', 'dispatch_poll_votes',
                      'spotlight_top_friends', 'listing_comments');

revoke select on public.rooms from anon;

-- PROVE IT, both directions, in this transaction.
--
-- ⚠️ Both halves are facts about GRANTS and POLICIES, not about rows, so they answer honestly on the
-- empty table a fresh apply produces. "Anon selected 0 rows" would not: 0 rows is also what an
-- ALLOWED reader gets from an empty table. That confusion is the defect 20270330000000 and
-- 20270331000000 each shipped in their first versions.
do $$
declare v_bad text;
begin
  -- NEGATIVE: not one of the six may still be anon-readable.
  select string_agg(table_name, ', ')
    into v_bad
    from information_schema.role_table_grants
   where table_schema = 'public' and grantee = 'anon' and privilege_type = 'SELECT'
     and table_name in ('rooms', 'room_messages', 'room_members', 'dispatch_poll_votes',
                        'spotlight_top_friends', 'listing_comments');
  if v_bad is not null then
    raise exception 'anon still holds SELECT on: %', v_bad;
  end if;

  -- POSITIVE 1: every SELECT grant `authenticated` held when this transaction opened, it still holds.
  -- The revoke names `anon`, so the only way this can fire is a revoke aimed at the wrong role.
  select string_agg(b.table_name, ', ')
    into v_bad
    from _auth_grants_before b
   where not exists (
     select 1 from information_schema.role_table_grants g
      where g.table_schema = 'public' and g.grantee = 'authenticated'
        and g.privilege_type = 'SELECT' and g.table_name = b.table_name
   );
  if v_bad is not null then
    raise exception 'authenticated lost SELECT on: % - this took too much', v_bad;
  end if;

  -- POSITIVE 2: public-room discovery survives for members.
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'rooms'
       and policyname = 'rooms_read_public_or_member'
       and qual like '%public%'
  ) then
    raise exception 'rooms_read_public_or_member dropped its public branch, so public-room discovery is gone';
  end if;
end $$;

commit;
