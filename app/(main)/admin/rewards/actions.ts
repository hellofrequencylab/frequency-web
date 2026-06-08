'use server'

import { revalidatePath } from 'next/cache'
import { getCallerProfile } from '@/lib/auth'
import { authorizeAction } from '@/lib/admin/guard'
import { evaluateRetroRewards, type RewardRunResult } from '@/lib/rewards/evaluate'
import { type ActionResult, ok, fail } from '@/lib/action-result'

// Run the retroactive reward engine (PI.5 / ADR-168). Admin/Janitor only. Idempotent —
// re-running never double-grants (the reward_grants unique guard + claim-then-pay). The
// page renders a dry-run preview; this action actually grants the pending rewards.
export async function runRetroRewards(): Promise<ActionResult<RewardRunResult>> {
  const caller = await getCallerProfile()
  try {
    await authorizeAction(caller, 'admin')
  } catch {
    return fail('Not authorized.')
  }

  const result = await evaluateRetroRewards({ dryRun: false })
  revalidatePath('/admin/rewards')
  revalidatePath('/', 'layout') // gem totals changed
  return ok(result)
}
