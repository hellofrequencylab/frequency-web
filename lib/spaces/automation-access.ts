// AUTOMATION ACCESS. ADR-1709 (LIVE-751) opened automation to the free Space (1 active automation, 100
// runs a month, both metered), replacing the default-deny `automation` entitlement read that locked a
// free Space out even during the beta grace. The code floor is free; an operator override that raises
// space_automation still locks, and spaceAutomationAllowed is the one place that asks.
//
// AUTOMATION WALL NAME (LIVE-432). The lock screen used to type Collective as the plan word.
// LIVE-228 merged that depth into Business. The code gate is space_automation at
// minEntitlement business. This seam reads the wall through featureWallLabel so an
// operator override that moves it moves the sentence with it. Never the retired label.

import { featureAllowed, loadFeatureGateOverrides, type FeatureGateOverrides } from '@/lib/pricing/gates'
import { featureGatesLive } from '@/lib/pricing/settings'
import { asSpacePlan } from '@/lib/pricing/plans'
import { featureWallLabel } from '@/lib/pricing/feature-tiers'
import { SPACE_PLAN_LABEL } from '@/lib/pricing/plans'

export const AUTOMATION_FEATURE = 'space_automation' as const

/** The same sentence the lock screen paints. PURE. `wall` is the naming-canon plan word. */
export function automationWallSentence(wall: string, canManage: boolean): string {
  return canManage
    ? `Automations come with ${wall}. Sequences and rules run your follow-ups for you.`
    : `Automations come with ${wall}. Ask an admin about the plan for this space.`
}

/** The plan word the lock screen names. Code default is Business. PURE once overrides are in. */
export function automationWallLabel(overrides: FeatureGateOverrides = {}): string {
  return featureWallLabel(AUTOMATION_FEATURE, overrides) ?? SPACE_PLAN_LABEL.business
}

/** IO wrapper: load the merged gate, then name the wall. */
export async function resolveAutomationWall(): Promise<string> {
  return automationWallLabel(await loadFeatureGateOverrides())
}

/** May this Space use automation? True on every plan by code default; false only when an operator
 *  override raises the gate and the grace window has closed. FAIL-SAFE to allowed. */
export async function spaceAutomationAllowed(space: { id?: string | null; plan?: string | null }): Promise<boolean> {
  try {
    const gatesLive = await featureGatesLive()
    const plan = asSpacePlan(space.plan ?? null)
    if (await featureAllowed(AUTOMATION_FEATURE, { plan }, { gatesLive })) return true
    // LIVE-822: a staff comp Space clears the gate at Collective. Read only on a refusal.
    const { spaceLimitsWaived } = await import('@/lib/pricing/space-allowance')
    return await featureAllowed(AUTOMATION_FEATURE, { plan, limitsWaived: await spaceLimitsWaived(space.id) }, { gatesLive })
  } catch {
    return true
  }
}
