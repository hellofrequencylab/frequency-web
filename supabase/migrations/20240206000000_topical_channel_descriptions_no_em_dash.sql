-- =============================================================================
-- 20240206 · Topical channel descriptions: warmer copy, no em dashes
-- =============================================================================
-- Rewrites the seven seeded topical_channel descriptions so they read in the
-- same friendly-guide voice the rest of the app now uses, and removes the
-- em dashes that survived from the original seed.
--
-- The new descriptions cap at roughly 2 lines in the standard max-w-2xl
-- header so they slot cleanly into the uniform page-header layout.
-- =============================================================================

UPDATE topical_channels SET description = 'Practice, presence, and the path within. Sitting, prayer, breath, ritual, however you tune in.'
  WHERE slug = 'spirituality';

UPDATE topical_channels SET description = 'Embodied practice. Breath, body, dance, yoga, running, lifting, whatever moves you.'
  WHERE slug = 'movement';

UPDATE topical_channels SET description = 'Whole-being wellness. Nutrition, sleep, healing, the slow work of taking care of a body.'
  WHERE slug = 'holistic-health';

UPDATE topical_channels SET description = 'Conscious communication, intimacy, conflict, repair. The work of being with other humans.'
  WHERE slug = 'human-relating';

UPDATE topical_channels SET description = 'Engaged practice for the world we want to live in. Local action, mutual aid, showing up.'
  WHERE slug = 'activism';

UPDATE topical_channels SET description = 'Art, music, writing, building. Expression as practice, and the people who keep making things.'
  WHERE slug = 'creative';

UPDATE topical_channels SET description = 'Soulful work. Entrepreneurship, livelihood, mission, the practice of getting paid for what you care about.'
  WHERE slug = 'business-support';
