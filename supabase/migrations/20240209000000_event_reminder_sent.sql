-- =====================================================================
-- Migration: Event reminder idempotency (P1.5)
--
-- Per-RSVP timestamps prevent the every-15-minute reminder cron from
-- sending duplicates. Setting them to timestamptz rather than booleans
-- so we can also reason about when the reminder fired (useful for support
-- and analytics).
-- =====================================================================

ALTER TABLE event_rsvps
  ADD COLUMN IF NOT EXISTS reminder_24h_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS reminder_2h_sent_at  timestamptz;

-- Index supports the cron's "find RSVPs that still need a reminder"
-- query: WHERE status='going' AND reminder_<lead>_sent_at IS NULL.
CREATE INDEX IF NOT EXISTS idx_event_rsvps_pending_24h
  ON event_rsvps(event_id)
  WHERE reminder_24h_sent_at IS NULL AND status = 'going';

CREATE INDEX IF NOT EXISTS idx_event_rsvps_pending_2h
  ON event_rsvps(event_id)
  WHERE reminder_2h_sent_at IS NULL AND status = 'going';
