-- Default a NULL content `space_id` to the ROOT space on insert (the safe interim tenancy guarantee).
--
-- THE GAP: circles/events/practices/journey_plans/programs each carry a NULLABLE `space_id` (the
-- tenancy axis, ADR-321). The read-isolation helper can_view_space_content (ADR-328) and the
-- write-isolation helper can_write_space_content (ADR-329) BOTH short-circuit on `space_id IS NULL`
-- and treat an unpartitioned row as visible/writable to everyone. So any insert that omits space_id
-- silently ESCAPES tenancy: the row is born owned by no space and is readable + writable network-wide.
-- ADR-321 backfilled every existing row to the root space, but NOTHING stops a new community
-- create-flow (which today does not always stamp space_id) from inserting a fresh NULL.
--
-- THE FIX (this migration): a BEFORE INSERT trigger on each of the five content tables that, when
-- `NEW.space_id IS NULL`, stamps it with the ROOT space id. The trigger function resolves the root
-- at insert time (`select id from public.spaces where type='root' limit 1`), so it is PORTABLE: no
-- hardcoded uuid, works across every environment that has a seeded root space (one row,
-- type='root', via 20260619000000_spaces_tenancy.sql). It is SAFE: it ONLY fills nulls; any insert
-- that already sets space_id (a sub-space create-flow) is left completely untouched, so no existing
-- create-flow changes behavior. The result is that an omitted space_id now resolves to root (which
-- is exactly how the isolation helpers already treat null today, just now PERSISTED as the explicit
-- root ownership instead of an ambiguous null that any future helper change could re-interpret).
--
-- WHY NOT `NOT NULL`: a hard NOT NULL constraint is the harder contract. It would REJECT every
-- create-flow that does not yet set space_id (breaking community circle/event/practice/journey/
-- program creation). That contract is DEFERRED until the app's dual-write of space_id is confirmed
-- in prod (ADR-321 expand -> dual-write -> backfill -> contract). This trigger is the interim
-- guarantee: it makes the column behave as if NOT NULL-with-default-root WITHOUT the breaking
-- rejection, so a null can never again escape tenancy, while every legacy and current create-flow
-- keeps working unchanged.
--
-- SECURITY DEFINER: the trigger reads public.spaces, which is RLS-protected (ADR-326 visibility-aware
-- SELECT policy). Running as definer (ADR-056 pattern, like is_space_member / can_view_space_content)
-- lets it resolve the root id without re-entering that RLS or depending on the inserting role's
-- visibility of the root row. search_path is pinned (public, pg_temp) so the resolution is not
-- hijackable. The function only reads spaces and assigns NEW.space_id; it grants no other authority.
--
-- House style: additive + idempotent (drop trigger if exists first), applied to production via the
-- Supabase SQL Editor (the repo's migration-history baseline predates `db push` being safe here,
-- see docs/WORKFLOW.md). This file is the canonical record. SAFE to re-run.

-- The trigger function: BEFORE INSERT, fill a null space_id with the root space.
create or replace function public.default_space_id_to_root()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.space_id is null then
    new.space_id := (select id from public.spaces where type = 'root' limit 1);
  end if;
  return new;
end;
$$;

comment on function public.default_space_id_to_root() is
  'BEFORE INSERT trigger function for the space_id-bearing content tables (circles/events/practices/journey_plans/programs). When NEW.space_id IS NULL it stamps the row with the ROOT space id (select id from public.spaces where type=''root'' limit 1); a non-null space_id is left untouched. PORTABLE (resolves root at insert time, no hardcoded uuid) and SAFE (only fills nulls, so no existing create-flow that already sets space_id is affected). This is the interim tenancy guarantee that keeps a null space_id from escaping the ADR-328/329 isolation helpers (which treat null as visible/writable to all), without the breaking NOT NULL contract (deferred until app dual-write is confirmed). SECURITY DEFINER (ADR-056) so it reads the RLS-protected spaces table without re-entering its RLS; search_path pinned. ADR-331.';

-- Lock the SECURITY DEFINER function down to the trigger path only. Unlike the RLS-helper definers
-- (can_view_space_content / is_space_member), which must be callable by anon/authenticated because RLS
-- policy expressions evaluate as the querying role, a trigger function is invoked by the trigger
-- system and needs NO execute grant for the triggering user. Revoking the default PUBLIC grant keeps
-- it from being reachable as a PostgREST RPC (/rest/v1/rpc/default_space_id_to_root) while the BEFORE
-- INSERT triggers still fire normally. Closes the Supabase security advisor warning on definer RPC.
revoke execute on function public.default_space_id_to_root() from public, anon, authenticated;

-- Attach the trigger to each of the five content tables (idempotent: drop then recreate).
drop trigger if exists circles_default_space_id on public.circles;
create trigger circles_default_space_id
  before insert on public.circles
  for each row execute function public.default_space_id_to_root();

drop trigger if exists events_default_space_id on public.events;
create trigger events_default_space_id
  before insert on public.events
  for each row execute function public.default_space_id_to_root();

drop trigger if exists practices_default_space_id on public.practices;
create trigger practices_default_space_id
  before insert on public.practices
  for each row execute function public.default_space_id_to_root();

drop trigger if exists journey_plans_default_space_id on public.journey_plans;
create trigger journey_plans_default_space_id
  before insert on public.journey_plans
  for each row execute function public.default_space_id_to_root();

drop trigger if exists programs_default_space_id on public.programs;
create trigger programs_default_space_id
  before insert on public.programs
  for each row execute function public.default_space_id_to_root();

-- One-time defensive backfill: any row that slipped in with a null space_id since the ADR-321
-- backfill is re-pinned to root. There should be 0 such rows today; this is belt-and-suspenders.
update public.circles
  set space_id = (select id from public.spaces where type = 'root' limit 1)
  where space_id is null;

update public.events
  set space_id = (select id from public.spaces where type = 'root' limit 1)
  where space_id is null;

update public.practices
  set space_id = (select id from public.spaces where type = 'root' limit 1)
  where space_id is null;

update public.journey_plans
  set space_id = (select id from public.spaces where type = 'root' limit 1)
  where space_id is null;

update public.programs
  set space_id = (select id from public.spaces where type = 'root' limit 1)
  where space_id is null;
