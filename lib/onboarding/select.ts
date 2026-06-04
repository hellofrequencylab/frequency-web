// Pure tip-selection + pacing (ADR-047 Phase 1). Given the member's tour state,
// the current route, and the time, pick at most ONE eligible tip — or none if the
// pacing cooldown hasn't cleared. No I/O; unit-tested. The provider persists state
// and renders; this decides what (if anything) to show.

import type { Tip } from './tips'

export interface TourState {
  seen: string[]
  dismissed: string[]
  lastShownAt?: string | null
}

/** Minimum gap between tips so they never stack ("let them click around first"). */
export const COOLDOWN_MS = 60_000

function matchesRoute(pathname: string, trigger: string): boolean {
  return pathname === trigger || pathname.startsWith(trigger + '/')
}

/** The highest-priority tip eligible right now, or null. Eligible = not already
 *  seen/dismissed, its route matches, its prerequisites are met, the pacing
 *  cooldown since the last tip has cleared, AND its activation task isn't already
 *  done (`satisfied` = the set of completed step keys — so we never nudge someone
 *  to do a thing they've already done, e.g. add a photo they already have). */
export function selectTip(
  tips: Tip[],
  state: TourState,
  pathname: string,
  now: number,
  satisfied: ReadonlySet<string> = new Set(),
): Tip | null {
  if (state.lastShownAt) {
    const last = Date.parse(state.lastShownAt)
    if (!Number.isNaN(last) && now - last < COOLDOWN_MS) return null
  }
  const done = new Set([...state.seen, ...state.dismissed])
  const seen = new Set(state.seen)
  const eligible = tips.filter(
    (t) =>
      !done.has(t.id) &&
      !(t.satisfiedKey && satisfied.has(t.satisfiedKey)) &&
      matchesRoute(pathname, t.trigger) &&
      (t.prerequisite ?? []).every((p) => seen.has(p)),
  )
  eligible.sort((a, b) => b.priority - a.priority)
  return eligible[0] ?? null
}
