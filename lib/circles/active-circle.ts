// The REQUEST-SCOPED active circle context for the circle DETAIL route — the seam that lets the
// circle's right-rail + feed render as self-fetching layout modules (the page-settings module
// engine, ADR-270/294) without prop-drilling. Mirrors lib/spaces/active-space.ts exactly.
//
// The circle modules (components/widgets/circles/*) are zero-prop RSCs bound in the widget
// registry (`() => Promise<ReactElement | null>`), so a module needs another way to learn WHICH
// circle it renders AND the per-viewer data the page already computed (members, caps, health,
// practice). The detail page resolves all of it ONCE and stamps it here; every circle module reads
// it back. No re-fetch, no prop-drilling, no registry-contract change.
//
// REQUEST-SAFE: `cache()` (React.cache) gives a per-request memo cell — one holder object per
// request (cleared between requests by the framework). A circle module that runs OUTSIDE a circle
// detail route reads `null` and renders nothing, exactly like every other null-returning module.

import { cache } from 'react'
import type { CircleDetail, MemberRow, CirclePractice, RunnableJourney } from './detail-types'

export interface CircleDetailContext {
  circle: CircleDetail
  /** Members, host-first then by join date (the order the Members block renders). */
  members: MemberRow[]
  myProfileId: string | null
  isMember: boolean
  isHost: boolean
  isCrew: boolean
  /** Holds circle.editSettings — host, scope leader, or admin of THIS circle. */
  canManage: boolean
  /** The health rail lights for managers OR in-scope Insight viewers. */
  showsHealth: boolean
  /** The Insight surface label when the viewer sees it via Insight (else null → "Circle health"). */
  insightLabel: string | null
  circleEarnedZaps: number
  activeStreaks: number
  newThisWeek: number
  circlePractice: CirclePractice | null
  /** Journeys the host can start a run of (empty for non-managers). */
  runnableJourneys: RunnableJourney[]
  /** The resolved movable Page-text block copy (per-circle override ?? network default); '' = none. */
  layoutText: string
}

interface Holder {
  ctx: CircleDetailContext | null
}

// One holder per request (React.cache memoizes by args — no args = one cell per request).
const holder = cache((): Holder => ({ ctx: null }))

/** Stamp the active circle context for this request (called once by the detail page). */
export function setCircleContext(ctx: CircleDetailContext): void {
  holder().ctx = ctx
}

/** The active circle context for this request, or null off a circle detail route (→ render nothing). */
export function getCircleContext(): CircleDetailContext | null {
  return holder().ctx
}
