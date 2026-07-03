-- Reconcile the NEW-USER SIGNUP trigger drift (prod <-> repo).
--
-- WHY: production runs a hardened `public.handle_new_auth_user()` (pinned search_path, sanitized +
-- collision-safe handle, and a blanket `EXCEPTION WHEN OTHERS` swallow) that NO migration file
-- reproduced — the only definition in the repo was the naive original in
-- 20240101000000_initial_schema.sql. That drift is a latent outage: a fresh deploy / `db reset` /
-- re-apply from the repo would install the fragile naive trigger, and any newly added
-- NOT-NULL-without-default column (or a failing chained trigger) would then make GoTrue return
-- "Database error saving new user" on EVERY signup channel (magic link + Google OAuth both land here).
--
-- WHAT: codify the working prod behavior into version control so repo == prod and a redeploy can never
-- regress signup. Two deliberate improvements over the prod swallow, neither of which can BLOCK a
-- signup:
--   1. Pin `search_path` (security-definer hygiene; matches the lockdown_secdef_* posture).
--   2. Replace the SILENT `EXCEPTION WHEN OTHERS THEN RETURN NEW` with `RAISE WARNING ... RETURN NEW`,
--      so a provisioning failure still never blocks the account (signup keeps working) but is no longer
--      invisible — an orphaned auth user (auth.users with no profiles row) now leaves a warning in the
--      postgres log instead of failing silently.
--
-- SAFE TO APPLY: never blocks signup (same guarantee as the current prod swallow); every column it sets
-- is satisfiable against the current profiles schema; idempotent (CREATE OR REPLACE + guarded trigger
-- recreate + idempotent REVOKE). This is a NO-OP-equivalent reconciliation, not a behavior change to
-- the happy path. Mirrored per docs/WORKFLOW.md — apply via the team's migration process, never by hand.

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  local_part   text := split_part(coalesce(new.email, ''), '@', 1);
  base_handle  text := lower(regexp_replace(local_part, '[^a-z0-9]', '', 'g'));
  final_handle text;
  attempt      int := 0;
begin
  if base_handle is null or base_handle = '' then
    base_handle := 'member';
  end if;

  -- Deterministic first try (email local-part + first 6 hex of the auth id), matching prod; fall back
  -- to random suffixes only on the (rare) handle collision, capped so this can never spin.
  final_handle := base_handle || '_' || substr(replace(new.id::text, '-', ''), 1, 6);
  while exists (select 1 from public.profiles where handle = final_handle) loop
    attempt := attempt + 1;
    exit when attempt >= 5;
    final_handle := base_handle || '_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);
  end loop;

  insert into public.profiles (auth_user_id, display_name, handle)
  values (
    new.id,
    coalesce(nullif(local_part, ''), 'New Member'),
    final_handle
  );

  return new;
exception
  when others then
    -- NEVER block signup (same guarantee as the prior prod swallow), but surface the failure: an
    -- orphaned auth user is now visible in the logs instead of failing silently.
    raise warning 'handle_new_auth_user: profile provisioning failed for auth user % : %', new.id, sqlerrm;
    return new;
end;
$$;

-- Recreate the trigger idempotently so the binding is guaranteed present + pointing at this definition.
drop trigger if exists trg_on_auth_user_created on auth.users;
create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- Keep the security-definer lockdown posture (20260926000000): the function is only ever invoked by the
-- trigger in GoTrue's insert context, never called directly, so no role needs EXECUTE.
revoke execute on function public.handle_new_auth_user() from public, anon, authenticated;
