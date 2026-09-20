// AUTOMATION WALL NAME (LIVE-432). The lock screen used to type Collective as the plan word.
// LIVE-228 merged that depth into Business. The code gate is space_automation at
// minEntitlement business. This seam reads the wall through featureWallLabel so an
// operator override that moves it moves the sentence with it. Never the retired label.

import { loadFeatureGateOverrides, type FeatureGateOverrides } from '@/lib/pricing/gates'
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
