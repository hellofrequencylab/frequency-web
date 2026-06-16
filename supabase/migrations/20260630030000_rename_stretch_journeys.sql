-- =============================================================================
-- Rename the Season 1 "Stretch" Journeys to single-word titles (operator request).
--   Clear Head  -> Clear   (Mind)
--   Get Moving  -> Move    (Body)
--   Charge Up   -> Charge  (Spirit)
-- Their Expression Challenges follow suit.
--
-- Display-only: no logic keys off `title`. SLUGS are intentionally UNCHANGED
-- (`clear-head` / `get-moving` / `charge-up`) so URLs, `criteria.journey_slug`,
-- and the seed's ON CONFLICT keys stay stable.
--
-- DO NOT APPLY MANUALLY — the orchestrator applies to prod after review.
-- =============================================================================

-- ── UP ───────────────────────────────────────────────────────────────────────
UPDATE public.journey_plans SET title = 'Clear'  WHERE slug = 'clear-head';
UPDATE public.journey_plans SET title = 'Move'   WHERE slug = 'get-moving';
UPDATE public.journey_plans SET title = 'Charge' WHERE slug = 'charge-up';

UPDATE public.season_challenges
  SET name = 'Express: Clear',
      description = 'Complete the Clear Expression capstone. Share what shifted -- in person at a Circle or solo online.'
  WHERE slug = 'express-clear-head';

UPDATE public.season_challenges
  SET name = 'Express: Move',
      description = 'Complete the Move Expression capstone. Show what moved you -- in person at a Circle or solo online.'
  WHERE slug = 'express-get-moving';

UPDATE public.season_challenges
  SET name = 'Express: Charge',
      description = 'Complete the Charge Expression capstone. Transmit what recharged you -- in person at a Circle or solo online.'
  WHERE slug = 'express-charge-up';

-- ── DOWN ───────────────────────────────────────────────────────────────────────
-- UPDATE public.journey_plans SET title = 'Clear Head' WHERE slug = 'clear-head';
-- UPDATE public.journey_plans SET title = 'Get Moving' WHERE slug = 'get-moving';
-- UPDATE public.journey_plans SET title = 'Charge Up'  WHERE slug = 'charge-up';
-- (and the three Express: * names/descriptions back to their "… Head/Moving/Up" forms)
