-- Seed nexus_regions so onboarding Step 3 (region picker) is usable.
-- Depth 0 = top-level regions shown in the dropdown.
-- Add sub-regions (depth 1+) and parent_id references as the community grows.

INSERT INTO nexus_regions (name, depth)
VALUES
  ('San Diego',        0),
  ('North County',     0),
  ('Carlsbad',         0),
  ('Encinitas',        0),
  ('Oceanside',        0),
  ('Vista',            0),
  ('San Marcos',       0),
  ('Escondido',        0),
  ('La Jolla',         0),
  ('Pacific Beach',    0),
  ('Mission Valley',   0),
  ('East County',      0),
  ('South Bay',        0),
  ('Other',            0)
ON CONFLICT DO NOTHING;
