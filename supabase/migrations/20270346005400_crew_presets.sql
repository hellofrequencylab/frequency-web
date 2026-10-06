-- LIVE-755 / ADR-1709: Crew asks $4.99, $10 or $25, with $10 suggested.
--
-- The stored catalog.pwyw row wins over the code default at runtime (lib/pricing/catalog-config.ts
-- asPwywConfig). Production carried {minCents 499, suggestedCents 2499} on 2026-10-06, with no preset
-- list, so the picker fell back to the code presets and pre-selected $24.99. This moves the stored row
-- to the ladder's numbers: presets 499/1000/2500, suggested 1000. The floor (499) and any soft ceiling
-- an operator set are kept; only the two keys this row owns are written.
--
-- Idempotent: re-running writes the same values. A missing row is inserted with the full shape.

begin;

insert into public.pricing_settings (key, value)
values (
  'catalog.pwyw',
  '{"minCents": 499, "suggestedCents": 1000, "maxCents": 10000, "presetCents": [499, 1000, 2500]}'::jsonb
)
on conflict (key) do update
  set value = public.pricing_settings.value
              || '{"suggestedCents": 1000, "presetCents": [499, 1000, 2500]}'::jsonb,
      updated_at = now();

commit;
