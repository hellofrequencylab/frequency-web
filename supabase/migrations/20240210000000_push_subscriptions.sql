-- =====================================================================
-- Migration: Push subscriptions (P1.4)
--
-- One row per (profile, browser/device endpoint). A single user can have
-- many subscriptions (laptop Chrome + phone Safari + work browser, etc.)
-- and we fan out to all of them when sending. The endpoint URL is the
-- mailbox provider's push service URL (FCM, Mozilla, Apple), and the
-- p256dh + auth keys are the encryption material the browser generated
-- when it subscribed.
--
-- 410 Gone responses from the push service are normal — they mean the
-- user revoked the subscription. lib/push.ts deletes those rows on
-- detection so this table stays self-pruning.
-- =====================================================================

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id    uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  endpoint      text        NOT NULL,
  p256dh        text        NOT NULL,
  auth          text        NOT NULL,
  user_agent    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_used_at  timestamptz,
  UNIQUE (profile_id, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_profile
  ON push_subscriptions(profile_id);


-- ── RLS ───────────────────────────────────────────────────────────────
-- Users can only see, insert, or delete their own subscriptions.
-- Server-side senders use service-role and bypass RLS entirely.

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "push_subscriptions: read own"
  ON push_subscriptions FOR SELECT
  USING (
    profile_id IN (SELECT id FROM profiles WHERE auth_user_id = auth.uid())
  );

CREATE POLICY "push_subscriptions: insert own"
  ON push_subscriptions FOR INSERT
  WITH CHECK (
    profile_id IN (SELECT id FROM profiles WHERE auth_user_id = auth.uid())
  );

CREATE POLICY "push_subscriptions: delete own"
  ON push_subscriptions FOR DELETE
  USING (
    profile_id IN (SELECT id FROM profiles WHERE auth_user_id = auth.uid())
  );
