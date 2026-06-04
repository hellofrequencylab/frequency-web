-- =====================================================================
-- Phase D (COMMS-STRATEGY / ADR-086): add the platform-wide `global`
-- dispatch tier.
--
-- Dispatch reach was Circle → Hub → Nexus (audience_scope check). The comms
-- strategy adds a `global` tier reserved for platform staff/janitor: a Nexus
-- leader reaches their Nexus; only staff broadcast to everyone.
--
-- DB change is minimal and reversible:
--   • widen the audience_scope check to include 'global';
--   • make audience_id nullable, but ONLY null for 'global' (scoped tiers still
--     require a target id).
-- Authoring is already service-role only (RLS: "service role writes"), so the
-- staff-only gate lives in the dispatch server action (app lane). The existing
-- read policy ("anyone authenticated can read published") already does the right
-- thing for a global dispatch — everyone sees it once published.
-- =====================================================================

-- Drop whatever the inline audience_scope check is named (auto-generated name
-- can vary), so re-running / different envs stay safe.
do $$
declare r record;
begin
  for r in
    select conname
    from pg_constraint
    where conrelid = 'public.dispatches'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%audience_scope%'
  loop
    execute format('alter table public.dispatches drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.dispatches
  add constraint dispatches_audience_scope_check
  check (audience_scope in ('circle', 'hub', 'nexus', 'global'));

-- Global dispatches have no single audience row; scoped tiers still must.
alter table public.dispatches
  alter column audience_id drop not null;

alter table public.dispatches
  drop constraint if exists dispatches_audience_id_scope_check;

alter table public.dispatches
  add constraint dispatches_audience_id_scope_check
  check (
       (audience_scope = 'global'                      and audience_id is null)
    or (audience_scope in ('circle', 'hub', 'nexus')   and audience_id is not null)
  );

-- =====================================================================
-- VERIFICATION (after apply):
--  A. insert a dispatch with audience_scope='global', audience_id=null → allowed.
--  B. insert audience_scope='global' with a non-null audience_id → rejected.
--  C. insert audience_scope='circle' with null audience_id → rejected (scoped
--     tiers unchanged).
--  Staff-only authoring is enforced in the server action, not RLS (writes are
--  already service-role only).
-- =====================================================================
