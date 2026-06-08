-- =============================================================================
-- Wide interaction capture — the raw behavioral firehose (PI.1, ADR-166)
--
-- The semantic `engagement_events` ledger holds NAMED business events (one row per
-- join / RSVP / verified practice). This is its high-volume RAW twin: the fine-grained
-- interaction stream the AI + reward engine read history from — views, dwell, scroll
-- depth, clicks, searches + zero-results, rage-clicks, form abandons. Deliberately
-- WIDE and jsonb-extensible so a new signal needs NO migration (the governing rule of
-- ADR-166: capture wide & immutable now, so every future metric/reward/model is a read
-- over data already banked).
--
-- Append-only. Member-tied for now (profile_id nullable to keep an anonymous-session
-- path open later). Writes go through the service role (the /api/observe batch sink);
-- it is consent-gated server-side (analytics scope, ADR-069). High-volume → retention-
-- bounded (the nightly retention cron purges raw rows past the window; rollups in PI.2
-- keep the durable aggregate).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.interaction_events (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  profile_id  uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  session_id  text,                       -- ephemeral client visit id (not PII); sessionizes a visit
  kind        text NOT NULL,              -- view | dwell | scroll | click | rage_click | search | zero_result | abandon | …
  surface     text,                       -- the route/page where it happened (e.g. '/circles/[slug]')
  path        text,                       -- the concrete path
  props       jsonb NOT NULL DEFAULT '{}',-- the WIDE bag: { ms, pct, target, q_len, … } — extend freely, no migration
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Read patterns: per-member timelines, per-kind volume, per-surface rollups, recency purge.
CREATE INDEX IF NOT EXISTS idx_interaction_events_profile  ON public.interaction_events (profile_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_interaction_events_kind     ON public.interaction_events (kind, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_interaction_events_surface  ON public.interaction_events (surface, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_interaction_events_created  ON public.interaction_events (created_at);

ALTER TABLE public.interaction_events ENABLE ROW LEVEL SECURITY;

-- No client reads or writes of the raw firehose: writes go through the service role
-- (the batch sink), reads are operator-only. Hosts+ may read (future admin surfaces);
-- members do not read the raw stream (PI.2 rollups are the member-facing aggregate).
DROP POLICY IF EXISTS "interaction_events: host reads" ON public.interaction_events;
CREATE POLICY "interaction_events: host reads"
  ON public.interaction_events FOR SELECT
  USING (get_my_role() >= 'host');

COMMENT ON TABLE public.interaction_events IS
  'Raw, wide behavioral firehose (PI.1/ADR-166) — the high-volume twin of engagement_events. Service-role insert via /api/observe; consent-gated; retention-bounded.';
