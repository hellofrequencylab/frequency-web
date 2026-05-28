-- ---------------------------------------------------------------------------
-- Profile presence: last_seen_at heartbeat
-- ---------------------------------------------------------------------------
-- Adds a nullable timestamp updated by a client-side heartbeat (~every 90s
-- while the tab is visible). Read by widgets that show "online now" (5-min
-- threshold) and "recently active" indicators.
--
-- Why nullable: existing rows have no heartbeat yet, and a user who has
-- never opened the app since this migration is, correctly, not "online."
-- ---------------------------------------------------------------------------

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

-- Partial index — we only ever query "recently active" rows, so the index
-- on a sparse predicate keeps it small and fast.
CREATE INDEX IF NOT EXISTS idx_profiles_last_seen_at
  ON profiles (last_seen_at DESC)
  WHERE last_seen_at IS NOT NULL;
