-- LIVE-755 / ADR-1709: Crew asks $5, $10 or $25, with $10 suggested (owner ruling 2026-10-06).
-- The floor stays $4.99.
--
-- 20270346005400_crew_presets went to production with the earlier draft's presets (499/1000/2500).
-- This moves the stored catalog.pwyw row to the ruled presets 500/1000/2500 and keeps suggested 1000.
-- The floor (499) and any soft ceiling an operator set are kept; only the two keys this row owns are
-- written. It also corrects the crew_boosts table comment: a Boost lifts a Circle in the Circle order
-- and marks a Space as Boosted, never reordering the Space directory.
--
-- Idempotent: re-running writes the same values. A missing row is inserted with the full shape.

begin;

insert into public.pricing_settings (key, value)
values (
  'catalog.pwyw',
  '{"minCents": 499, "suggestedCents": 1000, "maxCents": 10000, "presetCents": [500, 1000, 2500]}'::jsonb
)
on conflict (key) do update
  set value = public.pricing_settings.value
              || '{"suggestedCents": 1000, "presetCents": [500, 1000, 2500]}'::jsonb,
      updated_at = now();

comment on table public.crew_boosts is
  'Crew Boosts (LIVE-756, ADR-1709): one per Crew member per calendar month, given to a Circle or a Space. A Boost given in the last 7 days lifts a Circle in the default Circle order and marks a Space as Boosted, never reordering the Space directory (lib/crew/boost.ts). Service-role writes only.';

commit;
