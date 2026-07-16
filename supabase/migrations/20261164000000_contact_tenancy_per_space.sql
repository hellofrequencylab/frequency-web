-- Per-space (white-label) contact tenancy: contacts uniqueness moves from GLOBAL lower(email)
-- to PER-SPACE (space_id, lower(email)). See docs/CONTACT-TENANCY.md (ADR-624) for the full
-- decision, invariants, and the coordinated code-rescope audit.
--
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- WHY
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- public.contacts carries a GLOBAL unique index on lower(email) (contacts_email_lower_idx,
-- 20240221000000_studio_crm.sql), so ONE email = at most ONE contacts row across ALL Spaces.
-- White-label separation requires the SAME email to exist as a SEPARATE contact in Frequency's
-- ROOT space AND in an independent Space's CRM (e.g. the "Daniel Tyack" business space) — fully
-- separate leads with separate consent/fields. That means uniqueness must be per-tenant:
-- unique(space_id, lower(email)).
--
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- INVARIANTS PRESERVED (see the doc §Invariants)
-- ─────────────────────────────────────────────────────────────────────────────────────────────
--  1. MEMBER PROFILE LINK. The profiles_sync_contact trigger (20240222000000) links a signup's
--     profile_id to the contact by email. Under per-space uniqueness the conflict target and the
--     intended row change: a member's platform record is the ROOT-space contact, NOT some tenant
--     Space's lead row. sync_contact_from_profile() is replaced below to insert/target the ROOT
--     space explicitly and conflict on (space_id, lower(email)). This is on the signup path.
--  2. GLOBAL SUPPRESSION / STOP. email_suppressions is already scoped independently
--     (20260714000000_space_email.sql): space_id NULL = GLOBAL, non-NULL = per-Space; isSuppressed
--     matches in code. It does NOT depend on contacts uniqueness and is UNTOUCHED here.
--  3. NO DATA LOSS. Because the OLD index was globally unique on lower(email), there is at most one
--     contacts row per email today, so there cannot be two rows sharing (space_id, lower(email)).
--     The guard below verifies zero duplicates before creating the new unique index and aborts if
--     any are found.
--
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- SECURITY POSTURE
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- sync_contact_from_profile() stays SECURITY DEFINER with a pinned search_path, exactly as the
-- original (20240222000000) and consistent with the trigger-function lockdown
-- (20260926000000_lockdown_secdef_trigger_functions.sql). CREATE OR REPLACE preserves the existing
-- ACL, but we RE-ASSERT the revoke afterward so the posture is explicit and idempotent: a trigger
-- handler needs no EXECUTE grant for public/anon/authenticated and must not be reachable as a
-- PostgREST RPC.
--
-- House style: additive + idempotent, applied to production via the Supabase SQL Editor; this file
-- is the canonical record. SAFE to re-run. No em or en dashes.

-- ============================================================================================
-- 0. Pre-flight guards (belt-and-suspenders; both are no-ops on a healthy prod DB).
-- ============================================================================================

-- 0a. Any residual NULL space_id would (a) escape the new unique index (NULLs are distinct in a
--     UNIQUE) and (b) not match the ON CONFLICT (space_id, lower(email)) target in the trigger.
--     The contacts_default_space_id BEFORE INSERT trigger (20260714010000) and the 20260713010000
--     backfill should mean there are none, but re-pin any stragglers to root first.
update public.contacts
  set space_id = (select id from public.spaces where type = 'root' limit 1)
  where space_id is null;

-- 0b. Abort if ANY (space_id, lower(email)) duplicate exists (NO DATA LOSS invariant). On a healthy
--     DB the global unique index guarantees zero duplicates, so this raises nothing. If it ever
--     fires, resolve the duplicates by hand BEFORE re-running (do not auto-merge here).
do $$
declare
  v_dupes int;
begin
  select count(*) into v_dupes from (
    select space_id, lower(email) as le
    from public.contacts
    group by space_id, lower(email)
    having count(*) > 1
  ) d;
  if v_dupes > 0 then
    raise exception
      'contact-tenancy migration aborted: % (space_id, lower(email)) duplicate group(s) found. Resolve duplicates before creating the per-space unique index.', v_dupes;
  end if;
end $$;

-- ============================================================================================
-- 1. Swap the uniqueness axis: GLOBAL unique(lower(email)) -> PER-SPACE unique(space_id, lower(email)).
--    Create the new unique index FIRST (validates the guard held), then drop the global one.
-- ============================================================================================

-- The new tenant-scoped uniqueness. This is also the ON CONFLICT (space_id, lower(email))
-- inference target used by sync_contact_from_profile() and by any per-space upsert.
create unique index if not exists contacts_space_email_lower_idx
  on public.contacts (space_id, lower(email));

-- Keep a NON-UNIQUE functional index on lower(email) so the cross-space "all rows for this address"
-- scans stay indexed after the unique one is dropped: recordGlobalStop's platform-wide unsubscribe
-- (lib/crm/contact-consent.ts) and any all-Spaces email lookup. Previously the unique index served
-- this role; the per-space unique index leads with space_id, so it does not help a space-agnostic
-- email scan.
create index if not exists contacts_email_lower_idx_nonuniq
  on public.contacts (lower(email));

-- Drop the legacy GLOBAL unique index (one email = one contact across all Spaces). Named
-- contacts_email_lower_idx in 20240221000000_studio_crm.sql.
drop index if exists public.contacts_email_lower_idx;

comment on index public.contacts_space_email_lower_idx is
  'Per-space (white-label) contact uniqueness: at most one contact per (space_id, lower(email)). Replaces the global contacts_email_lower_idx so the SAME email can be a separate contact in the root space AND in an independent Space. The ON CONFLICT target for sync_contact_from_profile() and per-space contact upserts. ADR-624, docs/CONTACT-TENANCY.md.';
comment on index public.contacts_email_lower_idx_nonuniq is
  'Non-unique functional index on lower(email) for space-AGNOSTIC scans (recordGlobalStop platform-wide unsubscribe; all-Spaces email lookups). NOT a uniqueness guard: uniqueness is per (space_id, lower(email)). ADR-624.';

-- ============================================================================================
-- 2. Rewrite sync_contact_from_profile() to be correct under per-space uniqueness.
--    The member's platform record is the ROOT-space contact. Insert into the ROOT space explicitly
--    and conflict on (space_id, lower(email)) for that root row, so a signup links profile_id to the
--    ROOT contact and NEVER hijacks a tenant Space's lead row that happens to share the email.
-- ============================================================================================

create or replace function public.sync_contact_from_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_root  uuid;
begin
  select email into v_email from auth.users where id = new.auth_user_id;
  -- System / no-email profiles have nothing to link.
  if v_email is null then
    return new;
  end if;

  -- The member's platform contact lives in the ROOT space. Resolve it at run time (portable, no
  -- hardcoded uuid), mirroring default_space_id_to_root().
  select id into v_root from public.spaces where type = 'root' limit 1;

  -- Target the ROOT-space row specifically. The conflict target is the per-space unique index
  -- (space_id, lower(email)) created above, so this upsert can only ever create/update the member's
  -- ROOT contact; a tenant Space's lead row for the same email (space_id <> root) is untouched.
  insert into public.contacts (email, space_id, profile_id, display_name, source)
  values (lower(v_email), v_root, new.id, new.display_name, 'signup')
  on conflict (space_id, lower(email)) do update
    set profile_id   = excluded.profile_id,
        display_name  = coalesce(contacts.display_name, excluded.display_name);

  return new;
end;
$$;

comment on function public.sync_contact_from_profile() is
  'AFTER INSERT trigger on profiles: links a new signup to their ROOT-space CRM contact by email. Inserts into the root space explicitly and upserts on (space_id, lower(email)) so the member links to their PLATFORM record, never to a tenant Space lead row sharing the email (per-space contact tenancy, ADR-624). SECURITY DEFINER, pinned search_path; revoked from public/anon/authenticated (trigger-only). Replaces the global-lower(email) version from 20240222000000.';

-- Re-attach the trigger unchanged (idempotent). AFTER INSERT, one per row.
drop trigger if exists profiles_sync_contact on public.profiles;
create trigger profiles_sync_contact
  after insert on public.profiles
  for each row execute function public.sync_contact_from_profile();

-- Re-assert the trigger-function lockdown posture (idempotent; CREATE OR REPLACE preserves the ACL,
-- this makes it explicit and matches 20260926000000).
revoke execute on function public.sync_contact_from_profile() from public, anon, authenticated;
