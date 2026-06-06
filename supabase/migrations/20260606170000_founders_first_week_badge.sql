-- Founder's First Week — a MANUAL badge granted by the app when a Founder finishes
-- the first-week task set (lib/onboarding/founder-tasks.ts). Manual criteria means
-- the achievements rules engine skips it (lib/achievements.ts isRelevantEvent); the
-- claimFounderRewards() server action inserts the user_achievements row idempotently.
-- BETA-ACTIVATION §3–4 / build item 1.4. Re-runnable: ON CONFLICT DO NOTHING.
INSERT INTO achievements (slug, name, description, icon, category, tier, criteria, zaps_reward, sort_order)
VALUES (
  'founders-first-week',
  'Founder''s First Week',
  'Posted, reacted, made a friend, joined a second circle, RSVP''d, and built a 3-day practice streak — all in your first week.',
  'rocket',
  'special',
  'gold',
  '{"type":"manual"}',
  0,
  15
)
ON CONFLICT (slug) DO NOTHING;
