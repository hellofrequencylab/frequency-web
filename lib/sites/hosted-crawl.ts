import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { readWebsitePublished } from '@/lib/spaces/website'
import { readProfilePages } from '@/lib/spaces/profile-pages'
import { normalizeHost } from '@/lib/sites/host'
import { resolveHostedSpace } from '@/lib/sites/hosted'
import type { Space } from '@/lib/spaces/types'

// THE CRAWLER FILES OF A SPACE WEBSITE ON ITS OWN DOMAIN (PROG-E10 phase 4, LIVE-783). proxy.ts
// rewrites `https://<domain>/robots.txt` and `/sitemap.xml` to /hosted/<host>/robots.txt|sitemap.xml
// (lib/sites/host.ts). Both answer for the site only when it would render: the domain resolves to a
// Space (custom_domain gate, request host checked), the Space is visible to an anonymous viewer, and
// its website is published. Anything else is a site a crawler should leave alone.

export interface HostedCrawlTarget {
  /** `https://<host>`, the site's one origin. */
  origin: string
  /** The published, visible Space, or null when the host serves no indexable site. */
  space: Space | null
}

export async function resolveHostedCrawlTarget(hostParam: string): Promise<HostedCrawlTarget> {
  const origin = `https://${normalizeHost(decodeURIComponent(hostParam))}`
  const hosted = await resolveHostedSpace(hostParam)
  if (!hosted) return { origin, space: null }
  const space = await getVisibleSpaceBySlug(hosted.slug, null)
  if (!space || !readWebsitePublished(space.preferences)) return { origin, space: null }
  return { origin, space }
}

/** The page slugs a published site's sitemap lists (home first, then the Space's own pages). */
export function hostedSitemapSlugs(space: Pick<Space, 'preferences'>): string[] {
  return readProfilePages(space.preferences).map((p) => p.slug)
}
