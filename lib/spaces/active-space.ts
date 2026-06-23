// The REQUEST-SCOPED active Space for the entity-profile route (ENTITY-SPACES-BUILD §B.1/§B.2).
//
// Entity modules (components/widgets/entity/*) are self-fetching RSCs bound in the widget
// registry, whose contract is `() => Promise<ReactElement | null>` — they take NO props. So a
// module needs another way to learn WHICH Space's rows it should read. This request-scoped store
// is that seam: the profile layout resolves the Space once and stamps it here; every entity
// module reads it back, with zero prop-drilling and no change to the registry contract.
//
// HOW IT IS REQUEST-SAFE: `cache()` (React.cache) gives a per-request memo cell. We hold the
// active Space in a holder object returned by a cached function, so each request gets its own
// fresh holder (the cache is cleared between requests by the framework). A module that runs
// OUTSIDE a profile route reads `null` and renders nothing (fail-safe), exactly like every other
// `null`-returning module — so binding an entity module on a non-space route is harmless.
//
// This mirrors how the layout/SEO readers already thread `space_id` (lib/page-settings/store.ts):
// the Space dimension is request state, resolved once, read many times, tenant-scoped throughout.

import { cache } from 'react'
import type { Space } from './types'

interface ActiveSpaceHolder {
  space: Space | null
}

// One holder per request (React.cache memoizes by args — no args = one cell per request).
const holder = cache((): ActiveSpaceHolder => ({ space: null }))

/** Stamp the active Space for this request (called once by the profile layout/page). */
export function setActiveSpace(space: Space | null): void {
  holder().space = space
}

/** The active Space for this request, or null when none is set (e.g. a non-profile route). An
 *  entity module reads this to know which tenant's rows to load; null = render nothing. */
export function getActiveSpace(): Space | null {
  return holder().space
}
