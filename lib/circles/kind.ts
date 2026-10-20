// WHICH SHELF A CIRCLE SITS ON (LIVE-1020, ADR-1843). The Circles index groups circles by who runs
// them, derived from fields every circle already has, so nothing is stored and nothing drifts:
//
//   business   a Business or Non Profit Space owns it (its `space` is not the platform root)
//   frequency  a named primary circle (FREQUENCY_PRIMARY_SLUGS), or no Space owns it and it is an
//              operator-featured pick or belongs to a hub (the network's own chapters)
//   community  everything else: circles members started themselves
//
// Community leads the page and business sits last, so members' own groups are never buried under
// commerce.

export type CircleKind = 'frequency' | 'community' | 'business'

/** The platform's primary circles by slug (owner: "primary frequency circles, like Meld, Wildheart").
 *  Named, not inferred, so adding one is one line and a miss is never silent. They stay Frequency even
 *  when a Space owns them. */
export const FREQUENCY_PRIMARY_SLUGS: readonly string[] = ['meld', 'wildheart-primary-circle']

export function circleKind(c: { slug?: string | null; spaceType?: string | null; featuredAt?: string | null; hubId?: string | null }): CircleKind {
  if (c.slug && FREQUENCY_PRIMARY_SLUGS.includes(c.slug)) return 'frequency'
  const owned = !!c.spaceType && c.spaceType !== 'root'
  if (owned) return 'business'
  if (c.featuredAt || c.hubId) return 'frequency'
  return 'community'
}
