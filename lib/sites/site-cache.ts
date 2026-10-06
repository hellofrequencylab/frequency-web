import 'server-only'
import { revalidatePath } from 'next/cache'
import { crossRequestCached, invalidateCacheTag, siteCacheTag } from '@/lib/cross-request-cache'
import { getPublicSpaceBySlugOrThrow } from '@/lib/spaces/store'
import type { Space } from '@/lib/spaces/types'

// A SPACE WEBSITE IS CACHED, AND ITS OWNER'S SAVE REFRESHES IT (PROG-E10 phase 5, LIVE-784).
//
// The site routes (app/sites/[slug], app/hosted/[host]) used to render force-dynamic: every visit was
// a function invocation and a fresh read of the same rows for everybody. They are ISR now
// (`revalidate` + an empty generateStaticParams, the app/(public) pattern, with markAnonymousRender so
// nothing on the render can reach for a viewer), and the one read that decides the site, the Space row
// (its publish flag, its pages, its page docs, its brand), goes through the repo's cross-request seam
// (lib/cross-request-cache.ts) under the tag `site:<slug>`.
//
// WHY THE TAG IS WHAT MAKES THE PAGE REFRESH. Under ISR, the tags of every cached read a render makes
// are attached to the cached PAGE. Expiring `site:<slug>` therefore expires the cached row AND every
// cached page of that site, on /sites/<slug> and on the Space's own domain alike, without the writer
// knowing which host the site is served on. The owner's write paths call refreshSite(slug) beside the
// write: saving or resetting a page doc, publishing or unpublishing, and every Page panel change the
// site shows (brand, images, pages, domain). `updateTag` is read-your-own-writes, so an unpublish
// takes the site down on the very next request instead of after a stale serve.
//
// A write that does not call it (an operator's SQL, a surface outside the Page panel) is bounded by
// the seam's ten-minute ceiling, which also caps the page's own ISR window.

/** The Space behind a website, as an anonymous visitor sees it (active and network-visible), cached
 *  across requests under `site:<slug>`. Null for a missing, inactive or Private Space. */
export async function getSiteSpace(slug: string): Promise<Space | null> {
  const norm = slug.trim().toLowerCase()
  if (!norm) return null
  const read = crossRequestCached(getPublicSpaceBySlugOrThrow, ['site-space'], { tags: [siteCacheTag(norm)] })
  return read(norm)
}

/** Expire a Space website's cached row and pages. Call it beside any owner write the site shows. */
export function refreshSite(slug: string): void {
  invalidateCacheTag(siteCacheTag(slug))
  // Belt and braces for the /sites tree, the path the owner's "View site" link opens.
  revalidatePath(`/sites/${slug.trim().toLowerCase()}`, 'layout')
}
