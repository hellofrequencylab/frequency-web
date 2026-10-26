import { readProfilePages } from '@/lib/spaces/profile-pages'
import { readWebsitePublished } from '@/lib/spaces/website'
import { publishedWebsiteSnapshot } from '@/lib/sites/editor/state'
import { boundSiteDomain } from './site-domain'
import { sitePageUrl } from './seo'

/** Minimal public candidate data shared by metadata and sitemap. No additional row read is needed
 * for ordinary profiles; only a published website can ask the existing bound-domain authority. */
export interface ProfileCanonicalSite {
  id: string
  slug: string
  domain: string | null
  parentId?: string | null
  ownerProfileId?: string | null
  pages: string[]
}
export function profileCanonicalSite(space: Omit<ProfileCanonicalSite, 'pages'> & { preferences?: unknown }): ProfileCanonicalSite | null {
  if (!readWebsitePublished(space.preferences)) return null
  return { id: space.id, slug: space.slug, domain: space.domain, parentId: space.parentId,
    ownerProfileId: space.ownerProfileId,
    pages: (publishedWebsiteSnapshot(space.preferences)?.pages ?? readProfilePages(space.preferences)).map((p) => p.slug) }
}
export async function resolveProfileSiteCanonical(site: ProfileCanonicalSite | null | undefined, pageSlug = 'home'): Promise<string | null> {
  if (!site || !site.pages.includes(pageSlug) || (!site.domain && !site.parentId)) return null
  const domain = await boundSiteDomain(site)
  return domain ? sitePageUrl(`https://${domain}`, pageSlug) : null
}
