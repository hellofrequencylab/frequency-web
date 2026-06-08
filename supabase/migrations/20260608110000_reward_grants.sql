-- =============================================================================
-- Retroactive reward grants — idempotent grant ledger (PI.5, ADR-168)
--
-- The retroactive reward engine lets you define a rule TODAY ("anyone who ever reached
-- Agent gets 200 gems") and grant it against the IMMUTABLE history the PI track banked
-- (lifetime_rank, engagement_depth, the web_beta tag, the gem/zap ledgers). This table is
-- the idempotency backstop: one row per (rule, member), so a rule can be re-run on any
-- schedule and never double-grants. The reward itself lands in the existing gem/zap
-- ledger; this records THAT it was granted.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.reward_grants (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_key    text NOT NULL,
  profile_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reward_kind text NOT NULL,            -- 'gems' | 'zaps'
  amount      integer NOT NULL DEFAULT 0,
  detail      text,
  granted_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rule_key, profile_id)         -- the hard idempotency guard
);

CREATE INDEX IF NOT EXISTS idx_reward_grants_rule    ON public.reward_grants (rule_key, granted_at DESC);
CREATE INDEX IF NOT EXISTS idx_reward_grants_profile ON public.reward_grants (profile_id);

ALTER TABLE public.reward_grants ENABLE ROW LEVEL SECURITY;

-- A member sees their own grants; operators see all. Writes go through the service role.
DROP POLICY IF EXISTS "reward_grants: own or admin reads" ON public.reward_grants;
CREATE POLICY "reward_grants: own or admin reads"
  ON public.reward_grants FOR SELECT
  USING (profile_id = get_my_profile_id() OR get_my_role() >= 'admin');

COMMENT ON TABLE public.reward_grants IS
  'Idempotent ledger of retroactive reward grants (PI.5/ADR-168) — one row per (rule, member); the reward lands in gem_transactions/zap_transactions.';
