-- =====================================================================
-- Migration: Event recurrence (P1.6)
--
-- Adds a simple recurrence model to events. Two key choices:
--
--   1. Enum, not RRULE. Covers 95% of real cases (Wednesday Morning Ride,
--      First-Friday-of-the-month, daily morning meditation) without the
--      complexity of RFC 5545 parsing. Can be promoted to RRULE later
--      without losing data — just add a recurrence_rule text column and
--      keep recurrence_type as the simple path.
--
--   2. Materialised occurrences, not virtual. The anchor event is also a
--      real occurrence; future occurrences are generated as separate rows
--      with parent_event_id pointing back. This means RSVPs attach to
--      specific dates (correct for embodied-practice attendance, where
--      "going" means *this* Wednesday, not the series), cancellation works
--      naturally per-occurrence, and every existing query continues to
--      function unchanged.
-- =====================================================================

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS recurrence_type   text NOT NULL DEFAULT 'none'
    CHECK (recurrence_type IN ('none', 'daily', 'weekly', 'monthly')),
  ADD COLUMN IF NOT EXISTS recurrence_until  timestamptz,
  ADD COLUMN IF NOT EXISTS parent_event_id   uuid REFERENCES events(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_events_parent
  ON events(parent_event_id)
  WHERE parent_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_events_recurring_anchors
  ON events(recurrence_type, starts_at)
  WHERE recurrence_type <> 'none' AND parent_event_id IS NULL;

-- Defensive: an occurrence (parent_event_id set) should not itself be
-- recurring. Only anchors define a series.
ALTER TABLE events
  ADD CONSTRAINT events_occurrence_not_recurring
  CHECK (parent_event_id IS NULL OR recurrence_type = 'none');
