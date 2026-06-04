-- =====================================================================
-- Demo v2 — Stage 0: teardown of the old demo cast
-- =====================================================================
-- We are REPLACING the first-generation demo content (the old North County SD
-- cast in the c1…/c2…/c4…/c5… namespace AND the five out-of-area national metros
-- in the d… namespace) with a single, richer, fully-local Encinitas community
-- (the f1…/f2…/f4…/f5… cast seeded by the 20260605000101+ migrations).
--
-- Migrations are immutable history, so rather than edit the old seeds we delete
-- their rows here, then the v2 seeds insert the new cast. On a fresh DB the old
-- seeds insert → this deletes → v2 inserts; net result is only the v2 cast.
--
-- WHAT WE DELETE: every is_demo row of community CONTENT — posts, events,
-- circles, profiles — across all prior demo seeds. Cascades handle the join
-- rows (memberships, rsvps, reactions, practice_logs, user_achievements, etc.).
--
-- WHAT WE KEEP:
--   * The demo PRACTICE LIBRARY (practices.is_demo rows, e1… namespace) — it is
--     a shared, location-agnostic library we just enriched (20260605000000) and
--     extend in v2. Practices carry no metro, so nothing to retire.
--   * Shared geography (hubs, nexus_regions, topical_channels) — NOT demo-
--     flagged; the v2 cast reattaches to it.
--
-- Idempotent: re-running deletes nothing new. Safe.
-- =====================================================================

BEGIN;

-- Order: content that references profiles/circles first, then profiles. FK
-- cascades clean up memberships, event_rsvps, post_reactions, practice_logs,
-- user_achievements, challenge_progress, streaks, gem_transactions, etc.
DELETE FROM posts   WHERE is_demo;   -- feed content (also clears replies via parent cascade)
DELETE FROM events  WHERE is_demo;   -- cascades event_rsvps
DELETE FROM circles WHERE is_demo;   -- cascades memberships, circle_practices
DELETE FROM profiles WHERE is_demo;  -- cascades the member's owned join rows

-- Deliberately NOT touched: practices (library), hubs, nexus_regions,
-- topical_channels, platform_flags.

COMMIT;
