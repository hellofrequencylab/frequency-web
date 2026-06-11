// Scoped-surface presentation helpers (P1.6 scoped-surface adoption, ADR-225).
//
// The scoped detail pages (circle / hub / nexus) ask the surface matrix the SCOPED
// question — `surfaceAccess('insight', { type, id })` — so a steward who leads THIS
// scope by stewardship edge (even a global-member edge-leader) gets the in-scope
// Insight view at the depth the matrix grants: a circle Host gets the `limited`
// basic view, a hub Guide / nexus Mentor get the `full` deeper analytics
// (docs/ROLES.md §"Insight & Vera AI stewardship"). This module turns that
// AccessLevel into the page's affordance — kept pure (no Next/Supabase/React) so it
// is unit-testable and shared by all three scoped pages.
//
// Purely additive: a `none` level hides the affordance, exactly today's behavior for
// a non-leader; a led scope can only ADD it.

import type { AccessLevel } from './access-matrix'

/** The in-scope Insight affordance for a scoped page, derived from the matrix's
 *  AccessLevel on `insight` for the viewer-in-this-scope. */
export type InsightAffordance =
  | { visible: false }
  | { visible: true; depth: 'basic' | 'full'; label: string }

/**
 * Map the scoped `surfaceAccess('insight', scope)` level to the page affordance.
 * - `none`   ⇒ hidden (non-leader, unchanged).
 * - `limited`⇒ the steward's basic in-scope view ("Circle health").
 * - `full`   ⇒ the Guide/Mentor deeper analytics ("Insight").
 */
export function insightAffordance(level: AccessLevel): InsightAffordance {
  if (level === 'none') return { visible: false }
  return level === 'full'
    ? { visible: true, depth: 'full', label: 'Insight' }
    : { visible: true, depth: 'basic', label: 'Circle health' }
}

/** True when the viewer gets ANY in-scope Insight view (basic or full). */
export function showsScopedInsight(level: AccessLevel): boolean {
  return level !== 'none'
}
