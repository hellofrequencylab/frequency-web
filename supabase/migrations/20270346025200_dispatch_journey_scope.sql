-- =====================================================================
-- JOURNEY DISPATCH scope (SCAN-1165).
--
-- A Journey host's Dispatch to their cohort lands on the SAME Dispatch rail the community tiers and
-- Spaces ride (20270106000000 added 'space'): one `dispatches` row scoped to the Journey, read in
-- each enrolled member's feed. Reach was circle -> hub -> nexus -> global -> space; this adds a
-- `journey` tier whose audience_id is the journey plan (journey_enrollments.plan_id).
--
-- DB change is minimal, additive and idempotent:
--   * widen the audience_scope check to include 'journey';
--   * keep the paired audience_id rule: 'journey' is a SCOPED tier, so it requires a target id
--     (only 'global' may be null).
-- Authoring stays service-role only (RLS: "service role writes"), so the manage gate lives in the
-- launch action (app/(main)/journeys/[slug]/launch/actions.ts). No data is rewritten.
-- =====================================================================

-- Drop whatever the audience_scope check is named (auto-generated names vary), so re-running and
-- different envs stay safe.
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
  drop constraint if exists dispatches_audience_scope_check;

alter table public.dispatches
  add constraint dispatches_audience_scope_check
  check (audience_scope in ('circle', 'hub', 'nexus', 'global', 'space', 'journey'));

alter table public.dispatches
  drop constraint if exists dispatches_audience_id_scope_check;

alter table public.dispatches
  add constraint dispatches_audience_id_scope_check
  check (
       (audience_scope = 'global'                                        and audience_id is null)
    or (audience_scope in ('circle', 'hub', 'nexus', 'space', 'journey') and audience_id is not null)
  );

-- =====================================================================
-- VERIFICATION (after apply):
--  A. insert audience_scope='journey' with a journey plan id -> allowed.
--  B. insert audience_scope='journey' with null audience_id -> rejected.
--  C. insert audience_scope='global' with null audience_id -> still allowed.
-- =====================================================================
