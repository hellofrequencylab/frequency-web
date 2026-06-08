-- =============================================================================
-- Admin audit log (P8 security) — a unified record of sensitive platform actions:
-- who did what, to whom, when. Complements the domain-specific ledgers already in
-- place (platform_flag_events, studio_site_changes, reward_grants) with one append-only
-- stream for the crown-jewel mutations (role grants, persona verification, …).
--
-- Service-role write (the gated server actions log here); admin+ read.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  action      text NOT NULL,            -- e.g. 'role.assign', 'persona.verified'
  target_type text,                     -- e.g. 'profile'
  target_id   text,
  detail      jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON public.admin_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_action  ON public.admin_audit_log (action, created_at DESC);

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_audit_log: admin reads" ON public.admin_audit_log;
CREATE POLICY "admin_audit_log: admin reads"
  ON public.admin_audit_log FOR SELECT
  USING (get_my_role() >= 'admin');

COMMENT ON TABLE public.admin_audit_log IS
  'Unified audit log of sensitive admin actions (P8) — append-only; service-role write, admin+ read.';
