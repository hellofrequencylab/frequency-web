// The pure ordering + counting rules behind the Space Circles tab's filter row.
//
// They live here rather than inside page.tsx for one reason: they are the part of that page with
// real logic and no rendering, and while they sat in the route file they could not be unit-tested.
// LIVE-096 is what that cost — `roomIn` contradicted its own docstring for every uncapped Circle,
// which is the DEFAULT shape of a new Circle, and no test could have caught it.

import { asCircleAccess } from '@/lib/circles/visibility'
import type { SpaceCircle } from '@/lib/circles/store'

export type Sort = 'new' | 'active' | 'open'

/** An uncapped Circle's room, in seats. "Roomy but never infinite": high enough that an uncapped
 *  Circle outranks a nearly-full one under "Most room", low enough that a genuinely empty capped
 *  Circle with more than this many seats still wins. */
export const UNCAPPED_ROOM = 999

/** Can a stranger walk in? Open access AND a seat free. Used for the "Open to join" stat, so the
 *  number means what a visitor would take it to mean rather than counting rooms they cannot enter. */
export function isOpenToJoin(c: SpaceCircle): boolean {
  if (asCircleAccess(c.access) !== 'open') return false
  const cap = c.member_cap ?? 0
  return cap <= 0 || (c.member_count ?? 0) < cap
}

/** Seats left, with an uncapped circle treated as roomy but never infinite (so it does not
 *  permanently outrank a real circle with real space).
 *
 *  This returned 0 for the uncapped case until LIVE-096, which inverted the sort against this very
 *  docstring: every uncapped Circle sorted BELOW a capped one with a single seat left. `cap <= 0`
 *  means NO CAP, which `isOpenToJoin` above already reads correctly as always-joinable. The two
 *  disagreed about the same expression, and the one with a user-visible order was the wrong one. */
export function roomIn(c: SpaceCircle): number {
  const cap = c.member_cap ?? 0
  return cap > 0 ? Math.max(0, cap - (c.member_count ?? 0)) : UNCAPPED_ROOM
}

/** Newest / busiest / most room. `new` is the default and matches the reader's own order, so the
 *  unfiltered page costs no sort at all beyond this copy. */
export function sortCircles(rows: SpaceCircle[], sort: Sort): SpaceCircle[] {
  const out = [...rows]
  if (sort === 'active') return out.sort((a, b) => (b.member_count ?? 0) - (a.member_count ?? 0))
  if (sort === 'open') return out.sort((a, b) => roomIn(b) - roomIn(a))
  return out.sort((a, b) => +new Date(b.created_at ?? 0) - +new Date(a.created_at ?? 0))
}
