'use server'

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { type ActionResult, ok, fail } from '@/lib/action-result'

// Live reward-economy editing (DEVELOPMENT-MAP Stage A — reward economy). Lets a
// janitor tune the zap/gem amount, daily cap, and on/off per action WITHOUT a
// redeploy. The award engines (lib/zaps.ts / lib/gems.ts) already read these
// tables at grant time, so changes take effect immediately. Janitor-only — this
// is a global, sensitive setting. `zap_config`/`gem_config` aren't in the
// generated types yet, so writes go through an untyped handle (same convention
// as lib/zaps.ts).

// Internal types — NOT exported. A 'use server' module may only export async
// functions (non-async exports are stripped by the build), so the client keeps
// its own local `RewardKind`; the row shape is checked structurally at the call.
type RewardKind = 'zap' | 'gem'

interface RewardRowInput {
  action_type: string
  amount: number
  daily_cap: number | null
  is_active: boolean
}

const MAX_AMOUNT = 100_000

function clampInt(v: unknown, max = MAX_AMOUNT): number | null {
  const n = Math.floor(Number(v))
  if (!Number.isFinite(n) || n < 0) return null
  return Math.min(n, max)
}

export async function updateRewardConfig(
  kind: RewardKind,
  rows: RewardRowInput[],
): Promise<ActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return fail('Not signed in')

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('community_role')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (profile?.community_role !== 'janitor') return fail('Janitor only')

  const table = kind === 'zap' ? 'zap_config' : 'gem_config'
  const amountCol = kind === 'zap' ? 'zaps_amount' : 'gems_amount'
  const db = admin as unknown as SupabaseClient

  for (const r of rows) {
    if (!r.action_type) continue
    const amount = clampInt(r.amount)
    if (amount === null) return fail(`Invalid amount for "${r.action_type}"`)
    const dailyCap = r.daily_cap === null || r.daily_cap === undefined ? null : clampInt(r.daily_cap)

    const { error } = await db
      .from(table)
      .update({ [amountCol]: amount, daily_cap: dailyCap, is_active: !!r.is_active })
      .eq('action_type', r.action_type)
    if (error) return fail(error.message)
  }

  revalidatePath('/admin/gamification')
  return ok()
}
