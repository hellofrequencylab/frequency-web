-- =====================================================================
-- Retire the Beta demo seed: default demo_mode OFF + purge demo-metro geo
-- =====================================================================
-- The "demo seed" program (20240303 legacy + 20260603 demo_0..3) is retired.
-- Its demo CONTENT (is_demo circles/profiles/posts/events) is already cleared by
-- the demo system; what lingered was the GEOGRAPHY those seeds created — regions,
-- nexuses, and hubs for the national metros (Austin, Boulder, Asheville, Brooklyn,
-- Bend) plus Houston/Portland — which never carried is_demo and so never receded.
-- demo_mode was also left ON.
--
-- This migration makes the cleanup durable + reproducible on every environment:
--   1. demo_mode defaults OFF.
--   2. The demo-metro geography is deleted by slug, in FK order, KEEPING the real
--      San Diego / Encinitas / California tree (and Los Angeles + San Francisco).
--
-- Idempotent: each DELETE ... WHERE slug IN (...) is a no-op once the rows are gone.
-- Prod (azsqfeonabsbmemvddqd) was cleaned directly on 2026-06-25; this keeps fresh
-- databases and any other environment in step. See docs/DECISIONS.md ADR-400.
-- =====================================================================

-- 1. Demo mode off (the row is created by 20260603000001_demo_0_infrastructure).
UPDATE platform_flags SET value = false, updated_at = now() WHERE key = 'demo_mode';

-- 2. Demo-metro geography, deleted child-first (FKs are NO ACTION):
--    circles -> hubs -> nexuses -> outposts -> regions(metros) -> regions(states).
--    The Houston/Portland demo circles (seeded in 20240303000000_seed_demo_circles.sql)
--    carry circles.hub_id NOT NULL REFERENCES hubs with NO ACTION, so they must be
--    removed before their hubs. Circle child rows (memberships, etc.) are ON DELETE
--    CASCADE, so deleting the circle row cleans up after itself.
DELETE FROM circles WHERE hub_id IN (
  SELECT id FROM hubs WHERE slug IN ('bayou-city-hub','rose-city-hub')
);
DELETE FROM hubs    WHERE slug IN ('bayou-city-hub','rose-city-hub');
DELETE FROM nexuses WHERE slug IN ('houston-nexus','portland-nexus');
DELETE FROM outposts WHERE region_id IN (
  SELECT id FROM nexus_regions WHERE slug IN
    ('texas','austin','houston-r','oregon','bend','portland-r',
     'colorado','boulder','new-york','brooklyn','north-carolina','asheville')
);
DELETE FROM nexus_regions WHERE slug IN
  ('austin','houston-r','bend','portland-r','boulder','brooklyn','asheville'); -- metros (depth 3)
DELETE FROM nexus_regions WHERE slug IN
  ('texas','oregon','colorado','new-york','north-carolina');                   -- states (depth 2)
