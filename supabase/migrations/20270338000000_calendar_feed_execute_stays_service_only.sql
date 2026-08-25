-- `event_calendar_feed` loses the browser EXECUTE that 20270337000000 re-granted by accident
-- (ADR-1153).
--
-- 🔴 WHAT HAPPENED, AND IT IS A `create or replace` HAZARD WORTH NAMING. 20270337000000 fixed a real
-- leak in this function: an unapproved requester's calendar app was pulling a hidden venue. It
-- carried the function body forward with `create or replace` — and copied the trailing
-- `grant execute on function public.event_calendar_feed(text) to anon, authenticated;` from the
-- original definition (20261193000000) along with it.
--
-- That grant had been REVOKED in the meantime, by
-- 20270304000000_revoke_browser_execute_on_service_only_rpcs, and `scripts/function-grants.txt`
-- records the verdict as `internal`. Statements replay in order, so the copied grant is the state
-- that survives. The migration written to close a leak re-opened a wider one: any holder of the
-- publishable anon key could call this RPC directly against PostgREST, and it returns a member's
-- private calendar including venues marked hidden.
--
-- ✅ CAUGHT BY `check:function-grants` (LIVE-020) before it reached a PR, which named the offending
-- file directly. That guard exists because ADR-959 established that a revoke naming only PUBLIC
-- leaves the per-role grants Supabase's ALTER DEFAULT PRIVILEGES creates - and it turns out to catch
-- the mirror-image mistake too: a role-explicit grant that should no longer be there.
--
-- ⚠️ NOBODY NEEDS THIS GRANT. The single caller, app/events/calendar/[token]/route.ts, reads the feed
-- through `admin.rpc('event_calendar_feed', ...)` on the SERVICE_ROLE client. The token in the URL is
-- the credential and the route is the thing that checks it; the browser roles have never been part
-- of that path. A calendar app fetching the .ics is talking to the Next route, not to PostgREST.
--
-- ⚠️ THE GENERAL LESSON: carrying a function body forward with `create or replace` carries its GRANTS
-- forward too, and the grants are the half most likely to have changed underneath you since the body
-- was written. Re-derive them; never copy them.
--
-- ROLLBACK: there is none worth writing. Re-granting is the defect.

begin;

-- BOTH halves in ONE statement (ADR-959): revoking from PUBLIC alone leaves the explicit per-role
-- grants Supabase's ALTER DEFAULT PRIVILEGES stamps on every new function, and neither lock closes
-- on its own.
revoke execute on function public.event_calendar_feed(text) from public, anon, authenticated;

do $$
declare v_bad text;
begin
  -- NEGATIVE: no browser role may execute it.
  select string_agg(grantee, ', ')
    into v_bad
    from information_schema.role_routine_grants
   where routine_schema = 'public' and routine_name = 'event_calendar_feed'
     and privilege_type = 'EXECUTE' and grantee in ('anon', 'authenticated', 'PUBLIC');
  if v_bad is not null then
    raise exception 'browser roles still execute event_calendar_feed: %', v_bad;
  end if;

  -- POSITIVE: service_role keeps it, or the ONE caller that actually serves the .ics is broken.
  if not exists (
    select 1 from information_schema.role_routine_grants
     where routine_schema = 'public' and routine_name = 'event_calendar_feed'
       and privilege_type = 'EXECUTE' and grantee = 'service_role'
  ) then
    raise exception 'service_role lost EXECUTE on event_calendar_feed, so the calendar route is dead - this took too much';
  end if;
end $$;

commit;
