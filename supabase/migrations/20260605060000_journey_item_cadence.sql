-- Journeys builder (ADR-096): per-item cadence override. A practice can be daily in
-- one journey and weekly in another, so the cadence lives on the journey item, not
-- the practice. Null = inherit the practice's own `cadence`. Additive; the per-item
-- `note` already exists. journey_plan_items isn't in the generated types yet, so the
-- app reads/writes it through the untyped admin handle (repo convention).

alter table public.journey_plan_items
  add column if not exists cadence text;

comment on column public.journey_plan_items.cadence is
  'Per-journey cadence override for this practice (e.g. Daily, 3x/week). Null = the practice''s default cadence. ADR-096.';
