-- =============================================================================
-- On Air — the practice timer mini-app (P1; ADR-229, docs/ON-AIR.md).
--
-- Two additive tables. The ECONOMY is untouched: a session ends by calling the
-- existing logPractice() path (same idempotency, same zaps/bonuses/streaks) —
-- On Air is a stage for the engine, never a second engine.
--
--   * practice_sessions — one row per timed sit (mode, breath pattern, seconds).
--     Powers the minutes stats ("airtime") and session history. A session is NOT
--     a log: logging stays once per (member, practice, day); extra sits the same
--     day still record here.
--   * vera_dispatches — Vera's daily assignment, generated once per (member, day)
--     and CACHED (replays and history read this table; no live generation).
--     P1 writes deterministic template copy; P2 adds the AI voice layer on the
--     same rows (lib/vera-dispatch.ts).
--
-- RLS: members read their own rows; writes are service-role (repo norm).
-- NOTE: regenerate lib/database.types.ts after apply.
-- =============================================================================

CREATE TABLE IF NOT EXISTS practice_sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  practice_id uuid REFERENCES practices(id) ON DELETE SET NULL,
  mode        text NOT NULL DEFAULT 'timer' CHECK (mode IN ('timer','breath','log')),
  pattern     text,
  seconds     integer NOT NULL DEFAULT 0,
  started_at  timestamptz,
  ended_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_practice_sessions_profile ON practice_sessions (profile_id, ended_at DESC);

ALTER TABLE practice_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "practice_sessions: read own" ON practice_sessions;
CREATE POLICY "practice_sessions: read own" ON practice_sessions FOR SELECT USING (
  profile_id IN (SELECT id FROM profiles WHERE auth_user_id = auth.uid())
);

CREATE TABLE IF NOT EXISTS vera_dispatches (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  day         date NOT NULL,
  kind        text NOT NULL,
  copy        text NOT NULL,
  action_href text,
  payload     jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, day)
);
CREATE INDEX IF NOT EXISTS idx_vera_dispatches_profile ON vera_dispatches (profile_id, day DESC);

ALTER TABLE vera_dispatches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "vera_dispatches: read own" ON vera_dispatches;
CREATE POLICY "vera_dispatches: read own" ON vera_dispatches FOR SELECT USING (
  profile_id IN (SELECT id FROM profiles WHERE auth_user_id = auth.uid())
);
