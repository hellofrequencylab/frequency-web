-- The author's uploaded/pasted course outline, kept on the plan so Vera can read it when
-- populating EVERY phase (not just the opening week). Without this the source text was lost after
-- creation, so per-week populate improvised instead of following the outline (ADR-302 Steps 2-3).
alter table public.journey_plans
  add column if not exists source_overview text;

comment on column public.journey_plans.source_overview is
  'The author''s pasted/uploaded course outline, used to ground Vera when populating phases.';
