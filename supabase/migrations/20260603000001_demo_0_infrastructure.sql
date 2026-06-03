-- =====================================================================
-- Demo seed infrastructure (Beta) — FOUNDATION migration
-- =====================================================================
-- This is the foundation for a "demo seed" system: synthetic content we
-- can show off in Beta, then badge, recede, or wipe on demand. Three parts:
--
--   1. is_demo (boolean, per row) -------------------------------------
--      Every demo-able table gets `is_demo boolean NOT NULL DEFAULT false`.
--      A row with is_demo = true is demo content. Real member content stays
--      false (the default), so existing rows and all future writes are
--      untouched unless a seed explicitly opts in.
--
--   2. demo_mode (boolean, global) ------------------------------------
--      A single platform-wide switch lives in `platform_flags` under the
--      key 'demo_mode'. When true, the app may surface demo content (badged)
--      and/or let it "recede" — fade/deprioritise demo rows behind real
--      ones. When false, demo content is hidden. App code reads this flag;
--      writes go through the service-role admin client (RLS-bypassing),
--      mirroring gem_config / zap_config. Clients get read-only access.
--
--   3. Purge ----------------------------------------------------------
--      Tearing down the demo is uniform across every table:
--          DELETE FROM <table> WHERE is_demo;
--      No special-casing, no UUID lists — the flag is the contract.
--
-- Tables that get is_demo: profiles, circles, events, posts, practices.
--   * "circles" is the renamed `groups` table (hierarchy_v2); the live
--     community-group concept the app calls a Circle.
--   * "practices" is the North-Star practice library.
--   * NOTE on "programs": Programs are NOT a database table in this app.
--     They are Markdown files under content/programs/, read by lib/programs.ts
--     (completion is tracked as engagement_events of type 'program_complete').
--     There is therefore no programs table to flag here — demo programs, if
--     ever needed, would be authored as content files, not seeded rows.
--
-- Retag of the EXISTING (untagged) demo seed: the only fixed-UUID demo rows
-- the prior seed migrations inserted are the demo CIRCLES under the
-- '55000000-…' prefix (20240302_seed_circle_coords + 20240303_seed_demo_circles).
-- The shared geography they hang off (nexus_regions/outposts/nexuses/hubs under
-- the 11…/22…/33…/44… prefixes) is structural and shared with real content, so
-- it is deliberately NOT flagged. No demo profiles/posts/events were ever
-- seeded with fixed IDs, so nothing to retag there.
--
-- Idempotent: safe to re-run.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1 + 2. Per-row is_demo flag + partial index, on each demo-able table.
--        Partial index keeps the common is_demo = false path free of any
--        index bloat while making "find/recede/purge demo rows" cheap.
-- ---------------------------------------------------------------------

ALTER TABLE profiles  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE circles   ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE events    ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE posts     ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE practices ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_profiles_is_demo  ON profiles  (is_demo) WHERE is_demo;
CREATE INDEX IF NOT EXISTS idx_circles_is_demo   ON circles   (is_demo) WHERE is_demo;
CREATE INDEX IF NOT EXISTS idx_events_is_demo    ON events    (is_demo) WHERE is_demo;
CREATE INDEX IF NOT EXISTS idx_posts_is_demo     ON posts     (is_demo) WHERE is_demo;
CREATE INDEX IF NOT EXISTS idx_practices_is_demo ON practices (is_demo) WHERE is_demo;

-- ---------------------------------------------------------------------
-- 3. Global demo switch: platform_flags.
--    No general-purpose settings/config table exists (only the scoped
--    gem_config / zap_config). Create a small key→boolean flags table
--    following the same RLS shape: public read, no client writes (writes
--    go through the service-role admin client, which bypasses RLS).
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS platform_flags (
  key        text        PRIMARY KEY,
  value      boolean     NOT NULL DEFAULT false,
  updated_at timestamptz DEFAULT now()
);

INSERT INTO platform_flags (key, value)
VALUES ('demo_mode', true)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE platform_flags ENABLE ROW LEVEL SECURITY;

-- Public read (mirrors "zap_config: public read"); no INSERT/UPDATE/DELETE
-- policy means clients cannot write — only the service role can.
DROP POLICY IF EXISTS "platform_flags: public read" ON platform_flags;
CREATE POLICY "platform_flags: public read"
  ON platform_flags FOR SELECT USING (true);

-- ---------------------------------------------------------------------
-- 4. Retag the existing (untagged) demo seed.
--    All ten seeded demo circles share the fixed '55000000-…' UUID prefix.
-- ---------------------------------------------------------------------

UPDATE circles SET is_demo = true WHERE id::text LIKE '55000000-%';
