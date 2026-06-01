-- =============================================================================
-- Performance: add indexes for hot read paths found in the audit.
--
-- All are additive (CREATE INDEX IF NOT EXISTS); existing single-column indexes
-- are left in place. Composite indexes are ordered so their leading column also
-- serves the plain single-column lookups.
-- =============================================================================

-- events.scope_id was unindexed, yet the events list (.in('scope_id', circleIds))
-- and every circle's upcoming-events widget (.eq('scope_id', ...) + starts_at
-- ordering) filter on it. Composite with starts_at covers the range/order too.
CREATE INDEX IF NOT EXISTS idx_events_scope_starts
  ON events (scope_id, starts_at);

-- event_rsvps only had the two partial reminder indexes; the events page does
-- .in('event_id', ...).eq('status','going') with no usable index.
CREATE INDEX IF NOT EXISTS idx_event_rsvps_event_status
  ON event_rsvps (event_id, status);

-- Nearly every membership query adds .eq('status','active'); the existing
-- indexes are single-column (profile_id) / (circle_id), so status is filtered
-- after the scan. These composites (status as a trailing column) serve both the
-- status-filtered queries and the plain by-profile / by-circle lookups.
CREATE INDEX IF NOT EXISTS idx_memberships_profile_status
  ON memberships (profile_id, status);
CREATE INDEX IF NOT EXISTS idx_memberships_circle_status
  ON memberships (circle_id, status);

-- Topical-channel membership existence check (.eq('profile_id',...).eq('topical_channel_id',...)).
CREATE INDEX IF NOT EXISTS idx_tcm_profile_channel
  ON topical_channel_memberships (profile_id, topical_channel_id);
