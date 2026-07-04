import { createAdminClient } from '@/lib/supabase/admin'
import { getJanitor } from '@/lib/page-editor/guard'
import { RewardConfig, type RewardRow } from '@/app/(main)/admin/gamification/reward-config'

// Gamification layout module (LP7): the zap/gem reward-economy editor. SELF-GATING and janitor-only:
// it returns null for a non-janitor before any read, so a Site Admin never dead-ends in a gated
// editor. The guard is the web_role janitor axis (getJanitor) — the SAME axis the reward server
// actions enforce (updateRewardConfig / createRewardConfig / deleteRewardConfig), so the UI gate and
// the action gate agree. The guard MUST come first: createAdminClient() bypasses RLS, so it is the
// sole protection on these config reads. Fail-safe: missing rows default to [].

// zap_config / gem_config aren't in the generated types yet (read via untyped handle).
type ZapCfgRow = { action_type: string; zaps_amount: number; daily_cap: number | null; is_active: boolean; description: string | null }
type GemCfgRow = { action_type: string; gems_amount: number; daily_cap: number | null; is_active: boolean; description: string | null }

export async function GamificationRewards() {
  if (!(await getJanitor())) return null

  const cfg = createAdminClient()
  const [{ data: zapRows }, { data: gemRows }] = await Promise.all([
    cfg.from('zap_config').select('action_type, zaps_amount, daily_cap, is_active, description').order('action_type'),
    cfg.from('gem_config').select('action_type, gems_amount, daily_cap, is_active, description').order('action_type'),
  ])

  const zaps: RewardRow[] = ((zapRows as ZapCfgRow[] | null) ?? []).map((r) => ({
    action_type: r.action_type, amount: r.zaps_amount, daily_cap: r.daily_cap, is_active: r.is_active, description: r.description,
  }))
  const gems: RewardRow[] = ((gemRows as GemCfgRow[] | null) ?? []).map((r) => ({
    action_type: r.action_type, amount: r.gems_amount, daily_cap: r.daily_cap, is_active: r.is_active, description: r.description,
  }))

  return <RewardConfig zaps={zaps} gems={gems} />
}
