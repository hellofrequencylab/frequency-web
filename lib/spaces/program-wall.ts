// Program wall — LIVE-434. Running a Program is Business depth (LIVE-228 / ADR-1438).
// The settings tease and the catalog note name that wall through this seam, never
// Collective (retired as a plan label).

import { targetForEntitlementKey } from '@/lib/pricing/beta-notice'
import { SPACE_PLAN_LABEL, type SpacePlan } from '@/lib/pricing/plans'

export const PROGRAM_ENTITLEMENT_KEY = 'program'

/** The published plan that grants `program`. Derived from the depth set, never typed. */
export function programWallLabel(): string {
  const target = targetForEntitlementKey(PROGRAM_ENTITLEMENT_KEY)
  const tier = target?.tier
  if (tier && tier in SPACE_PLAN_LABEL) return SPACE_PLAN_LABEL[tier as SpacePlan]
  return SPACE_PLAN_LABEL.business
}

export function programCatalogNote(): string {
  return `Included with ${programWallLabel()}`
}

export function programTeaseBody(): string {
  return `${programWallLabel()} carries Programs, Chapters, and the Channel your Space owns, plus automation, team roles, and multiple pipelines.`
}

export function programTeaseCta(): string {
  return `See what ${programWallLabel()} adds`
}
