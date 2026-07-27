-- Take the TRIGGER functions off the REST surface (advisor: *_security_definer_function_executable).
--
-- A trigger function returns `trigger` and exists only to fire from its trigger. Postgres checks
-- EXECUTE at trigger CREATION, not at fire time, so revoking the grant cannot affect any trigger.
-- What it removes is a browser's ability to POST /rest/v1/rpc/<name> and invoke a SECURITY DEFINER
-- function directly. Proven, not assumed: an isolated SECURITY DEFINER trigger function with the
-- same revoke applied still fired on insert (`revoked_trigger_still_fired: true`) while a direct
-- call as `authenticated` was denied (`can_call_directly: false`).
--
-- REVOKING FROM anon/authenticated ALONE IS A NO-OP. Postgres grants EXECUTE on a new function to
-- PUBLIC by default, which shows up in `proacl` as a bare `=X/postgres` entry. Every role inherits
-- PUBLIC, so `revoke ... from anon, authenticated` leaves the function fully callable. An earlier
-- draft of this migration made exactly that mistake and measured no change in the advisor count.
-- The revoke has to name `public` first; the role names are kept for the case where an explicit
-- per-role grant was also issued at some point.
--
-- service_role KEEPS its grant. It is the server-side key and is not reachable from a browser, and
-- some of these functions are invoked by backfills and admin scripts running under it.
--
-- Applied to production 2026-07-27. Written as a catalog-driven loop rather than a hand-listed set
-- so a trigger function added later by another migration is covered on the next `db reset` replay
-- instead of quietly re-appearing on the REST surface.
--
-- REVERSIBLE: `grant execute on function public.<name>() to anon, authenticated;` per function.

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure::text as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and pg_get_function_result(p.oid) = 'trigger'
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
  end loop;
end $$;
