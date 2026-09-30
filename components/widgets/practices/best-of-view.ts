// The URL half of the practices-best-of block (LIVE-681, ADR-1678), kept pure so it is testable
// without a request. The block is the Library's ranked catalog, moved onto /practices when the owner
// ruled one front door; /library is a 308 to /practices and the query rides through, so the block
// reads the SAME key the Library page did (`type`) and a forwarded /library?type=journey lands on
// the Journeys lane.
//
// `pillar` is deliberately NOT read here. The community_library RPC returns `pillar` as null for
// every row, so the Library's `?pillar=` filter matched nothing; forwarded to /practices it now
// filters the faceted practice library by Pillar slug instead, which is what the link meant.

import type { ContentType } from '@/lib/library'

/** Cards shown before "Show all": a ranked preview, so the block does not bury the library below it. */
export const BEST_OF_PREVIEW = 12
/** The RPC's own ceiling (community_library clamps `_limit` to 200); the Library page asked for it. */
export const BEST_OF_MAX = 200
/** The block's anchor, so a tab or "Show all" click lands back on the block, not the page top. */
export const BEST_OF_ANCHOR = 'practices-best-of'

export type BestOfLane = ContentType | 'all'

export const BEST_OF_LANES: { key: BestOfLane; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'practice', label: 'Practices' },
  { key: 'journey', label: 'Journeys' },
]

export type BestOfView = {
  /** null = the All lane (both types), exactly as the Library page's default tab. */
  type: ContentType | null
  /** `best=all`: the whole ranked catalog up to BEST_OF_MAX instead of the preview. */
  expanded: boolean
}

/** Read the block's view from the page's query string (the `x-search` header, with or without '?'). */
export function parseBestOf(search: string): BestOfView {
  const sp = new URLSearchParams(search)
  const t = sp.get('type')
  return {
    type: t === 'practice' || t === 'journey' ? t : null,
    expanded: sp.get('best') === 'all',
  }
}

/** A /practices link that changes only the block's own keys and keeps every other facet (the
 *  practice library's pillar, tag, sort, search, page) as it stands. */
export function bestOfHref(search: string, over: { lane?: BestOfLane; expanded?: boolean }): string {
  const sp = new URLSearchParams(search)
  if (over.lane !== undefined) {
    if (over.lane === 'all') sp.delete('type')
    else sp.set('type', over.lane)
  }
  if (over.expanded !== undefined) {
    if (over.expanded) sp.set('best', 'all')
    else sp.delete('best')
  }
  const s = sp.toString()
  return `/practices${s ? `?${s}` : ''}#${BEST_OF_ANCHOR}`
}
