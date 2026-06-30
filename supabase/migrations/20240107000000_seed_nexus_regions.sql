-- Seed nexus_regions so onboarding Step 3 (region picker) is usable.
-- Depth 0 = top-level regions shown in the dropdown.
-- Add sub-regions (depth 1+) and parent_id references as the community grows.

INSERT INTO nexus_regions (name, slug, depth)
VALUES
  ('San Diego',        'san-diego',       0),
  ('North County',     'north-county',    0),
  ('Carlsbad',         'carlsbad',        0),
  ('Encinitas',        'encinitas',       0),
  ('Oceanside',        'oceanside',       0),
  ('Vista',            'vista',           0),
  ('San Marcos',       'san-marcos',      0),
  ('Escondido',        'escondido',       0),
  ('La Jolla',         'la-jolla',        0),
  ('Pacific Beach',    'pacific-beach',   0),
  ('Mission Valley',   'mission-valley',  0),
  ('East County',      'east-county',     0),
  ('South Bay',        'south-bay',       0),
  ('Other',            'other',           0)
ON CONFLICT DO NOTHING;
