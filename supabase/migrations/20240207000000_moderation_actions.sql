-- =====================================================================
-- Migration: Moderation actions (P0.3)
--
-- Wires real consequences to the existing /admin/moderation queue. Until
-- now, clicking "Take Action" on a member or event report flipped status
-- without doing anything; this fixes that and adds soft-hide on content.
--
-- New capabilities:
--   • Suspend a member (suspended_at + optional suspended_until)
--   • Soft-hide a post or dispatch (hidden_at, recoverable)
--   • Seed a system profile so moderation can DM members from a non-personal voice
--   • DB-level guard preventing suspended members from inserting new content
-- =====================================================================


-- ── Profile suspension fields ────────────────────────────────────────

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS suspended_at      timestamptz,
  ADD COLUMN IF NOT EXISTS suspended_until   timestamptz,
  ADD COLUMN IF NOT EXISTS suspended_reason  text,
  ADD COLUMN IF NOT EXISTS suspended_by      uuid REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_system         boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_profiles_suspended
  ON profiles(suspended_at)
  WHERE suspended_at IS NOT NULL;


-- ── Soft-hide columns on content tables ──────────────────────────────

ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS hidden_at  timestamptz,
  ADD COLUMN IF NOT EXISTS hidden_by  uuid REFERENCES profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_posts_visible_by_created
  ON posts(created_at DESC)
  WHERE hidden_at IS NULL;

ALTER TABLE dispatches
  ADD COLUMN IF NOT EXISTS hidden_at  timestamptz,
  ADD COLUMN IF NOT EXISTS hidden_by  uuid REFERENCES profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_dispatches_visible_by_created
  ON dispatches(created_at DESC)
  WHERE hidden_at IS NULL;


-- ── Seed the system moderation profile (idempotent) ─────────────────
-- Used as the sender when "Warn" DMs are fired from /admin/moderation.
-- Has no auth_user_id (column is nullable) so it can't sign in.

INSERT INTO profiles (display_name, handle, community_role, is_system, auth_user_id)
VALUES ('Frequency Moderation', 'moderation', 'janitor', true, NULL)
ON CONFLICT (handle) DO UPDATE SET is_system = true;


-- ── Suspension enforcement trigger ──────────────────────────────────
-- Blocks INSERT on posts and dispatches when the author is currently
-- suspended (suspended_at set AND suspended_until either null or future).
-- Service-role inserts bypass via auth.role() = 'service_role' so admin
-- actions (e.g. lifting a suspension and re-inserting test data) still
-- work.

CREATE OR REPLACE FUNCTION enforce_member_not_suspended()
RETURNS trigger AS $$
DECLARE
  is_currently_suspended boolean;
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  SELECT (
    suspended_at IS NOT NULL
    AND (suspended_until IS NULL OR suspended_until > now())
  )
  INTO is_currently_suspended
  FROM profiles
  WHERE id = NEW.author_id;

  IF is_currently_suspended THEN
    RAISE EXCEPTION 'Account is suspended and cannot post until the suspension is lifted.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_posts_block_suspended      ON posts;
DROP TRIGGER IF EXISTS trg_dispatches_block_suspended ON dispatches;

CREATE TRIGGER trg_posts_block_suspended
  BEFORE INSERT ON posts
  FOR EACH ROW EXECUTE FUNCTION enforce_member_not_suspended();

CREATE TRIGGER trg_dispatches_block_suspended
  BEFORE INSERT ON dispatches
  FOR EACH ROW EXECUTE FUNCTION enforce_member_not_suspended();
