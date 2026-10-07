import { readWebsitePublished } from '@/lib/spaces/website'
import { readProfilePages } from '@/lib/spaces/profile-pages'
import { SITE_CONTACT_SLUG, siteHasContactPage } from '@/lib/sites/house-theme'
import { appOrigin, normalizeHost } from '@/lib/sites/host'
import { resolveHostedSpace } from '@/lib/sites/hosted'
import { getSiteSpace } from '@/lib/sites/site-cache'
import { siteBaseUrl } from '@/lib/sites/seo'
import { boundSiteDomain } from '@/lib/sites/site-domain'
import type { Space } from '@/lib/spaces/types'

// THE CRAWLER FILES OF A SPACE WEBSITE ON ITS OWN DOMAIN (PROG-E10 phase 4, LIVE-783). proxy.ts
// rewrites `https://<domain>/robots.txt`, `/sitemap.xml` and `/llms.txt` to
// /hosted/<host>/robots.txt|site-sitemap|site-llms (lib/sites/host.ts). Both answer for the site only when it would render: the domain resolves to a
// Space (custom_domain gate), the Space is visible to an anonymous viewer, and its website is
// published. Anything else is a site a crawler should leave alone.
//
// THE FREE SUBDOMAIN TOO (LIVE-782). `<slug>.frequencylocal.com` reaches the same routes and resolves
// by slug (lib/sites/hosted.ts). Both files name the site's ONE canonical origin, the rule siteMetadata
// uses: the bound custom domain when there is one, else the subdomain. So a subdomain whose Space has
// moved to its own domain points crawlers at the domain's sitemap and URLs, never its own copy.

export interface HostedCrawlTarget {
  /** The site's one canonical origin: `https://<bound domain>`, else `https://<slug>.frequencylocal.com`.
   *  `https://<host>` when the host serves no indexable site. */
  origin: string
  /** The published, visible Space, or null when the host serves no indexable site. */
  space: Space | null
}

export async function resolveHostedCrawlTarget(hostParam: string): Promise<HostedCrawlTarget> {
  const origin = `https://${normalizeHost(decodeURIComponent(hostParam))}`
  const hosted = await resolveHostedSpace(hostParam)
  if (!hosted) return { origin, space: null }
  const space = await getSiteSpace(hosted.slug)
  if (!space || !readWebsitePublished(space.preferences)) return { origin, space: null }
  return { origin: siteBaseUrl(space.slug, await boundSiteDomain(space), appOrigin()), space }
}

/** The pages a published site serves (home first, then the Space's own pages, then Contact when the
 *  form is placed), with their nav labels. */
export function hostedSitePages(space: Pick<Space, 'preferences'>): { slug: string; label: string }[] {
  const pages = readProfilePages(space.preferences).map((p) => ({ slug: p.slug, label: p.label }))
  return siteHasContactPage(space.preferences) ? [...pages, { slug: SITE_CONTACT_SLUG, label: 'Contact' }] : pages
}

/** The page slugs a published site's sitemap lists (home first, then the Space's own pages). */
export function hostedSitemapSlugs(space: Pick<Space, 'preferences'>): string[] {
  return hostedSitePages(space).map((p) => p.slug)
}
