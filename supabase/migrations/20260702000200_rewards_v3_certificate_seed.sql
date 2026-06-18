-- Rewards Economy v3 — Certificate seed (ADR-305, docs/REWARDS-ECONOMY.md)
--
-- The Certificate is the season capstone: finishing all three Journeys
-- (Mind / Body / Spirit) in a Quest. Granted by lib/quest/complete.ts, which
-- unlocks this achievement, grants the granted-only cosmetic below, and pays the
-- 'certificate_bonus' Gems. Seeded here so those grants have rows to reference.

begin;

-- The Certificate achievement (granted by code; not auto-evaluated).
insert into achievements (slug, name, description, icon, category, tier, criteria, zaps_reward, is_secret, sort_order)
values (
  'certificate',
  'Certificate',
  'Finished all three Journeys this season.',
  'award',
  'seasonal',
  'platinum',
  '{}'::jsonb,
  0,
  false,
  900
)
on conflict (slug) do update
  set name = excluded.name, description = excluded.description, icon = excluded.icon,
      category = excluded.category, tier = excluded.tier;

-- The Certificate's unique cosmetic (granted-only: gem_cost 0, not purchasable).
insert into store_items (slug, name, description, category, gem_cost, icon, metadata, is_active, sort_order)
values (
  'certificate-seal',
  'Certificate Seal',
  'The season capstone, earned by finishing all three Journeys.',
  'cosmetic',
  0,
  'award',
  '{"grant_only": true}'::jsonb,
  false,
  900
)
on conflict (slug) do update
  set name = excluded.name, description = excluded.description, metadata = excluded.metadata;

commit;
