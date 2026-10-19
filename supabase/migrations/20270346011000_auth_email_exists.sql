-- SCAN-1013: the /join account check asks the database one question instead of walking every
-- auth user.
--
-- THE GAP. joinEmailHasAccount (SCAN-906) answers an anonymous yes/no about an address by paging
-- auth.admin.listUsers 1,000 rows at a time, up to 50 pages per call. Each check costs up to 50
-- admin API reads and grows with the member count, and when Upstash is unconfigured the throttle
-- is open (whenUnconfigured: 'allow'), so that cost is unbounded.
--
-- THE FIX. One SECURITY DEFINER lookup, auth_email_exists(text), that reads auth.users by the
-- address GoTrue stores (lowercased, trimmed) and returns a boolean. It is granted to service_role
-- only: the answer is an account-existence oracle, so the browser never gets to call it. The
-- server action keeps both throttles (per IP and per mailbox, SCAN-1007) in front of it.
--
-- Apply with execute_sql, then insert supabase_migrations.schema_migrations at version
-- 20270346011000. Do not apply_migration. Do not db push.
--
-- ROLLBACK:
--   drop function if exists public.auth_email_exists(text);
--
-- House style: idempotent (create or replace), pinned search_path, revoke by role name (ADR-959:
-- a bare `from public` leaves Supabase's per-role default grants standing). No em or en dashes.
-- pgTAP: supabase/tests/auth_email_exists.test.sql.

begin;

create or replace function public.auth_email_exists(p_email text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  -- GoTrue stores every address lowercased and trimmed, and auth.users carries a unique index on
  -- email, so an equality on the normalised input is one index probe. A null, blank or
  -- over-long input is false, never an error.
  select case
    when p_email is null or btrim(p_email) = '' or length(p_email) > 320 then false
    else exists (
      select 1 from auth.users u
       where u.email = lower(btrim(p_email))
    )
  end;
$$;

comment on function public.auth_email_exists(text) is
  'SCAN-1013. Does an auth.users row exist for this address (lowercased, trimmed)? service_role only: the server action joinEmailHasAccount calls it behind a per-IP and a per-mailbox throttle, so the browser never gets an unthrottled account-existence oracle. Not a PostgREST RPC for anon or authenticated.';

revoke all on function public.auth_email_exists(text) from public, anon, authenticated;
grant execute on function public.auth_email_exists(text) to service_role;

commit;
