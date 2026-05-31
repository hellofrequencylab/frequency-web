-- =====================================================================
-- Zap economy config: make the in-person / external reward amounts
-- tunable, bringing zaps to parity with gem_config (gems were already
-- DB-configurable). awardZapsForAction() (lib/zaps.ts) reads this;
-- ZAP_AMOUNTS in code stays as a fallback so a missing row never breaks
-- a grant. Writes go through the service-role admin client (RLS-bypassing),
-- mirroring gem_config; clients get read-only access.
--
-- daily_cap is reserved: zap actions are naturally idempotent at the
-- engagement_events layer (one verified practice per event/day via the
-- idempotency_key), so per-day caps are enforced there, not here.
-- =====================================================================

CREATE TABLE IF NOT EXISTS zap_config (
  id          uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type text    UNIQUE NOT NULL,
  zaps_amount integer NOT NULL DEFAULT 1,
  daily_cap   integer,
  is_active   boolean NOT NULL DEFAULT true,
  description text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO zap_config (action_type, zaps_amount, daily_cap, description) VALUES
  ('event_attend',    25, NULL, 'Verified check-in at an in-person gathering (practice.verified)'),
  ('event_host',      50, NULL, 'Host an in-person gathering'),
  ('practice_logged', 15, 1,    'Log that you did your practice (practice.verified)'),
  ('node_capture',    10, NULL, 'Capture a physical node (QR / NFC / ghost); node.zaps_value overrides'),
  ('invite_accepted', 30, NULL, 'Someone you invited joins and shows up'),
  ('outreach_task',   20, NULL, 'Complete an outreach / marketing task')
ON CONFLICT (action_type) DO NOTHING;

ALTER TABLE zap_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "zap_config: public read"
  ON zap_config FOR SELECT USING (true);
