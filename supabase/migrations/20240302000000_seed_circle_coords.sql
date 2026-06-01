-- Seed real coordinates for the demo in-person circles so the Circles "Near you"
-- map renders pins. Locations match each circle's description (San Diego county).
-- Idempotent: matches the seeded fixed IDs (and the user-created skate circle by
-- name, only when its coords are unset); safe to re-run.

UPDATE circles
SET latitude = 33.0203, longitude = -117.2797,
    neighborhood = COALESCE(neighborhood, 'Cardiff-by-the-Sea')
WHERE id = '55000000-0000-0000-0000-000000000001'; -- Cardiff Morning Circle

UPDATE circles
SET latitude = 32.7986, longitude = -117.2558,
    neighborhood = COALESCE(neighborhood, 'Crystal Pier, Pacific Beach')
WHERE id = '55000000-0000-0000-0000-000000000002'; -- Pacific Beach Evening Circle

UPDATE circles
SET latitude = 33.0461, longitude = -117.2969,
    neighborhood = COALESCE(neighborhood, 'Moonlight Beach, Encinitas')
WHERE id = '55000000-0000-0000-0000-000000000004'; -- Encinitas Morning Circle

-- User-created Encinitas skate circle (no fixed id): match by name, only if unset.
UPDATE circles
SET latitude = 33.0489, longitude = -117.2607,
    neighborhood = COALESCE(neighborhood, 'Encinitas Community Park')
WHERE type = 'in-person' AND latitude IS NULL AND name ILIKE '%skate or die%';
