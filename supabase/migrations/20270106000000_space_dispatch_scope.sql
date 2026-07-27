-- =====================================================================
-- SPACE DISPATCH scope (Space message center, ADR-858).
--
-- A Space owner announces to their members on the same Dispatch rail the
-- community tiers use — one `dispatches` row scoped to the Space, not a
-- parallel broadcaster. Reach was circle → hub → nexus → global
-- (20240106000000 + 20260604200000); this adds a `space` tier whose
-- audience_id is the spaces row.
--
-- DB change is minimal and reversible:
--   • widen the audience_scope check to include 'space';
--   • keep the paired audience_id rule: 'space' is a SCOPED tier, so it
--     requires a target id (only 'global' may be null).
-- Authoring stays service-role only (RLS: "service role writes"), so the
-- space-manage gate lives in the compose path (lib/spaces/dispatch.ts).
-- =====================================================================

-- Drop whatever the audience_scope check is named (auto-generated name
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
  check (audience_scope in ('circle', 'hub', 'nexus', 'global', 'space'));

alter table public.dispatches
  drop constraint if exists dispatches_audience_id_scope_check;

alter table public.dispatches
  add constraint dispatches_audience_id_scope_check
  check (
       (audience_scope = 'global'                             and audience_id is null)
    or (audience_scope in ('circle', 'hub', 'nexus', 'space') and audience_id is not null)
  );

-- =====================================================================
-- VERIFICATION (after apply):
--  A. insert audience_scope='space' with a spaces id → allowed.
--  B. insert audience_scope='space' with null audience_id → rejected.
--  C. insert audience_scope='global' with null audience_id → still allowed
--     (Phase D behaviour unchanged).
-- =====================================================================
