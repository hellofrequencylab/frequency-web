-- =====================================================================
-- Migration: Notification Preferences (P0.2)
--
-- Per-user opt-in/out for each (channel × category) pair.
-- Channels: email, inapp, push
-- Categories: dispatches, events, mentions, lifecycle
--
-- Defaults (opt-in everything for existing members, no regression):
--   email_*  = true   (matches current behaviour — emails already firing)
--   inapp_*  = true
--   push_*   = false  (P1.4 hasn't shipped; UI toggles are locked)
--
-- Lazy-create pattern: a missing row is treated by the helper as
-- defaults-true (email + inapp) so we don't need to backfill existing
-- profiles. Rows are upserted the first time the user saves preferences.
-- =====================================================================

CREATE TABLE IF NOT EXISTS notification_preferences (
  profile_id        uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,

  -- Email channel
  email_dispatches  boolean NOT NULL DEFAULT true,
  email_events      boolean NOT NULL DEFAULT true,
  email_mentions    boolean NOT NULL DEFAULT true,
  email_lifecycle   boolean NOT NULL DEFAULT true,

  -- In-app channel (bell tray + /notifications)
  inapp_dispatches  boolean NOT NULL DEFAULT true,
  inapp_events      boolean NOT NULL DEFAULT true,
  inapp_mentions    boolean NOT NULL DEFAULT true,
  inapp_lifecycle   boolean NOT NULL DEFAULT true,

  -- Push channel (locked until P1.4 ships PWA service worker + VAPID)
  push_dispatches   boolean NOT NULL DEFAULT false,
  push_events       boolean NOT NULL DEFAULT false,
  push_mentions     boolean NOT NULL DEFAULT false,
  push_lifecycle    boolean NOT NULL DEFAULT false,

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);


-- ── RLS ───────────────────────────────────────────────────────────────
-- Users manage their own row only. No admin override needed; admins
-- never need to read/edit member preferences directly (they configure
-- platform-wide defaults via migrations, not per-user toggles).

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notification_preferences: read own"
  ON notification_preferences FOR SELECT
  USING (
    profile_id IN (
      SELECT id FROM profiles WHERE auth_user_id = auth.uid()
    )
  );

CREATE POLICY "notification_preferences: insert own"
  ON notification_preferences FOR INSERT
  WITH CHECK (
    profile_id IN (
      SELECT id FROM profiles WHERE auth_user_id = auth.uid()
    )
  );

CREATE POLICY "notification_preferences: update own"
  ON notification_preferences FOR UPDATE
  USING (
    profile_id IN (
      SELECT id FROM profiles WHERE auth_user_id = auth.uid()
    )
  );


-- ── Updated_at trigger (uses existing set_updated_at() helper) ────────

CREATE TRIGGER trg_notification_preferences_updated_at
  BEFORE UPDATE ON notification_preferences
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
