-- friendships_freeze_identity() runs as the caller, so the identity freeze actually binds members (SCAN-812).
-- See docs/BUILD-BACKLOG.json for status; this file explains the work, it does not track it.
--
-- THE DEFECT. 20270221000000 created friendships_freeze_identity() as SECURITY DEFINER and opened it
-- with `if current_user in ('service_role', 'postgres', 'supabase_admin') then return new`. Inside a
-- SECURITY DEFINER function current_user is the function OWNER (postgres), so that branch was true
-- for every caller and the trigger returned before it compared anything. A member UPDATE could
-- rewrite user_a_id, user_b_id and requested_by; only the tightened WITH CHECK on
-- friendships_update_addressee_accept stood in the way, and a predicate over the new row cannot
-- freeze the old one (the addressee could swap the requester for a third profile and accept).
-- The SCAN-696 guard on event_rsvps shipped with the same idiom and was fixed the same way.
--
-- THE FIX. Re-create the function WITHOUT security definer. It reads no table, only NEW and OLD, so
-- it needs no elevated rights; as an invoker function current_user is the real role
-- (authenticated for a browser write, service_role for the server key), and the trusted-writer
-- branch now admits only what its comment says it admits. search_path stays pinned. The trigger
-- itself is unchanged: CREATE OR REPLACE keeps it attached, and Postgres checks EXECUTE when a
-- trigger is created, not when it fires, so the 20270224000100 revoke still stands and still costs
-- nothing here.
--
-- Additive and idempotent: create or replace, same signature, same body apart from the header.
-- Behavioural proof: supabase/tests/friendships_freeze_identity.test.sql.
--
-- REVERSIBLE: re-run 20270221000000's definition (security definer). Doing so re-opens the hole.

create or replace function public.friendships_freeze_identity()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  -- The service-role/admin clients are trusted and already bypass RLS; the only in-app
  -- service-role writer (lib/connections/introductions.ts) stamps edge_type/introduced_by
  -- and never touches the identity triple, so this exemption is not load-bearing for it.
  if current_user in ('service_role', 'postgres', 'supabase_admin') then
    return new;
  end if;

  if new.user_a_id    is distinct from old.user_a_id
  or new.user_b_id    is distinct from old.user_b_id
  or new.requested_by is distinct from old.requested_by then
    raise exception 'friendships: user_a_id, user_b_id and requested_by are immutable'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke execute on function public.friendships_freeze_identity() from public, anon, authenticated;
