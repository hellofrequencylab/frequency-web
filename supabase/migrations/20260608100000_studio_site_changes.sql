-- =============================================================================
-- Studio site-change audit log (PI.4, ADR-167)
--
-- The AI Intelligence Studio lets Admin/Janitor APPLY a governed, reversible site
-- change from a recommendation. Every apply (and revert) is recorded here — who, what
-- action, with which params, and the outcome — so AI-assisted backend changes are never
-- silent. Flag toggles ALSO write platform_flag_events (their own audit); this captures
-- the Studio decision uniformly across every action kind (reindex, flag, config…).
--
-- The actions themselves are constrained to a code-declared allow-list
-- (lib/studio/site-actions.ts) — the AI can only ever PROPOSE a registered, reversible
-- action; it can never invent an arbitrary backend mutation.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.studio_site_changes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_key  text NOT NULL,                         -- a key from the site-action registry
  params      jsonb NOT NULL DEFAULT '{}',
  rec_id      text,                                   -- the recommendation that prompted it
  actor_id    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  status      text NOT NULL DEFAULT 'applied' CHECK (status IN ('applied', 'reverted', 'failed')),
  detail      text,                                   -- human note / error / result summary
  created_at  timestamptz NOT NULL DEFAULT now(),
  reverted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_studio_site_changes_created ON public.studio_site_changes (created_at DESC);

ALTER TABLE public.studio_site_changes ENABLE ROW LEVEL SECURITY;

-- Operators read the log; writes go through the service role (the gated server action).
DROP POLICY IF EXISTS "studio_site_changes: admin reads" ON public.studio_site_changes;
CREATE POLICY "studio_site_changes: admin reads"
  ON public.studio_site_changes FOR SELECT
  USING (get_my_role() >= 'admin');

COMMENT ON TABLE public.studio_site_changes IS
  'Audit log of governed site changes applied from the AI Studio (PI.4/ADR-167). Allow-listed actions only; admin/janitor-gated; reversible.';
