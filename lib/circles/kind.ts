// WHICH SHELF A CIRCLE SITS ON (LIVE-1020, ADR-1841). The Circles index groups circles by who runs
// them, derived from fields every circle already has, so nothing is stored and nothing drifts:
//
//   business   a Business or Non Profit Space owns it (its `space` is not the platform root)
//   frequency  no Space owns it and the platform runs it: an operator-featured pick, or one that
//              belongs to a hub (the network's own chapters)
//   community  everything else: circles members started themselves
//
// Community leads the page and business sits last, so members' own groups are never buried under
// commerce.

export type CircleKind = 'frequency' | 'community' | 'business'

export function circleKind(c: { spaceType?: string | null; featuredAt?: string | null; hubId?: string | null }): CircleKind {
  const owned = !!c.spaceType && c.spaceType !== 'root'
  if (owned) return 'business'
  if (c.featuredAt || c.hubId) return 'frequency'
  return 'community'
}
