// SET A SPACE'S PLAN — write `spaces.plan` + EXPAND `spaces.entitlements` from the plan's default
// key map (lib/pricing/plans.ts). This is the function the P2 Stripe webhook will call when a Space
// subscribes/changes plan; in P1 it is callable by an admin/owner action only, and is STILL gated
// by `billing_live` so nothing flips a Space's entitlements while billing is OFF.
//
// It does NOT restructure `spaceHasEntitlement` (lib/spaces/entitlements.ts): it only WRITES the
// `{ key: true }` keys that reader already consumes. The merge is ADDITIVE — it sets the plan's
// keys true and leaves any other operator-set entitlement keys untouched (so a manual grant, e.g.
// the ADR-361 P3 `{crm:true}` an operator set by hand, is preserved). Server-only (service-role).

import { createAdminClient } from '@/lib/supabase/admin'
import { asSpacePlan, planEntitlements, type SpacePlan } from './plans'
import { billingLive } from './settings'

export interface SetSpacePlanResult {
  ok: boolean
  /** Why the write was skipped (when ok=false). 'billing_off' | 'not_found' | 'error'. */
  reason?: 'billing_off' | 'not_found' | 'error'
  plan?: SpacePlan
  entitlements?: Record<string, boolean>
}

/** Set a Space's billing plan and expand its entitlements to match (the keys planEntitlements grants
 *  merged OVER the Space's current blob — additive, so manual grants survive). GATED on billingLive():
 *  while billing is OFF this is a no-op returning { ok:false, reason:'billing_off' }, so a Space's
 *  entitlements never change in P1. P2's webhook calls this once billing is live.
 *
 *  `opts.force` bypasses ONLY the billing gate (for an explicit operator action that wants to set a
 *  plan before billing goes live); the entitlement expansion is identical. FAIL-SAFE: returns
 *  { ok:false } on any error rather than throwing into the caller. */
export async function setSpacePlan(
  spaceId: string,
  plan: SpacePlan | string,
  opts: { force?: boolean } = {},
): Promise<SetSpacePlanResult> {
  const target = asSpacePlan(typeof plan === 'string' ? plan : null)
  try {
    if (!opts.force && !(await billingLive())) {
      return { ok: false, reason: 'billing_off', plan: target }
    }
    const db = createAdminClient()
    // Read the current entitlements so the expansion is additive (preserve manual grants). The
    // plan/entitlements columns aren't in the generated types yet (ADR-246) — reach untyped.
    const { data: row } = (await db
      .from('spaces')
      .select('id, entitlements')
      .eq('id', spaceId)
      .maybeSingle()) as { data: { id?: string; entitlements?: unknown } | null }
    if (!row?.id) return { ok: false, reason: 'not_found', plan: target }

    const current =
      row.entitlements && typeof row.entitlements === 'object' && !Array.isArray(row.entitlements)
        ? (row.entitlements as Record<string, unknown>)
        : {}
    // Additive merge: keep existing keys, set the plan's keys true.
    const next: Record<string, boolean> = {}
    for (const [k, v] of Object.entries(current)) next[k] = v === true
    Object.assign(next, planEntitlements(target))

    const { error } = await (db as unknown as {
      from: (t: string) => {
        update: (v: Record<string, unknown>) => { eq: (c: string, val: string) => Promise<{ error: unknown }> }
      }
    })
      .from('spaces')
      .update({ plan: target, entitlements: next })
      .eq('id', spaceId)
    if (error) return { ok: false, reason: 'error', plan: target }
    return { ok: true, plan: target, entitlements: next }
  } catch {
    return { ok: false, reason: 'error', plan: target }
  }
}
