import { getSpaceByDomain } from '@/lib/spaces/store'
import { briefError, log } from '@/lib/log'
import { isAppHost, networkChapterHost, normalizeHost } from '@/lib/sites/host'
import { isNetworkPlan } from '@/lib/collective/member-spaces'
import { createAdminClient } from '@/lib/supabase/admin'
import { readWebsitePublished } from '@/lib/spaces/website'
import type { Space } from '@/lib/spaces/types'

// IS THIS SPACE'S WEBSITE SERVED ON ITS OWN DOMAIN? (PROG-E10 phase 4, LIVE-783)
//
// The site's canonical origin is the Space's domain only when a request to that domain would really
// reach this Space's site: spaces.domain is set, it is not one of Frequency's own hosts, and
// getSpaceByDomain resolves it back to THIS Space (which is where the custom_domain plan gate lives,
// so a Space that lost the gate stops claiming a domain it no longer serves). Anything else is the
// /sites/<slug> origin. The domain read only runs when spaces.domain is set, which is rare.

/** What a Space needs to say whether it is a chapter on its Network's domain. A caller with only
 *  `{ id, domain }` simply never gets a chapter address. */
type ChapterFields = Partial<Pick<Space, 'slug' | 'parentId' | 'ownerProfileId'>>

/** A chapter's address on its Network's domain (`encinitas.thegrouplocal.com`), or null. A Space with a
 *  domain of its own keeps it. Otherwise: it is a same-owner child of an active Network whose own domain
 *  is bound and served (boundSiteDomain), and its slug can be a label. One read of the parent, only for
 *  a Space that has one. */
export async function chapterSiteHost(space: Pick<Space, 'domain'> & ChapterFields): Promise<string | null> {
  if (space.domain || !space.parentId || !space.slug) return null
  try {
    const { data } = await createAdminClient()
      .from('spaces')
      .select('id, domain, plan, status, owner_profile_id')
      .eq('id', space.parentId)
      .maybeSingle()
    const parent = data as unknown as { id: string; domain: string | null; plan: string | null; status: string | null; owner_profile_id: string | null } | null
    if (!parent || parent.status !== 'active' || !parent.domain || !isNetworkPlan(parent.plan)) return null
    if (space.ownerProfileId && parent.owner_profile_id !== space.ownerProfileId) return null
    return networkChapterHost(space.slug, await boundSiteDomain({ id: parent.id, domain: parent.domain }))
  } catch (err) {
    log.warn('chapter_site_host_failed', { slug: space.slug, message: briefError(err) })
    return null
  }
}

/** The bound domain of a Space's website, or null when the site lives at /sites/<slug>. A chapter of a
 *  Network that holds a domain is bound to its address on that domain (chapterSiteHost). */
export async function boundSiteDomain(space: Pick<Space, 'id' | 'domain'> & ChapterFields): Promise<string | null> {
  const domain = normalizeHost(space.domain)
  if (!domain) return chapterSiteHost(space)
  if (isAppHost(domain)) return null
  try {
    const served = await getSpaceByDomain(domain)
    return served?.id === space.id ? domain : null
  } catch (err) {
    // A failed read keeps the /sites origin: a wrong canonical on a transient error is worse than
    // a correct-but-secondary one. Logged, so the fallback firing is visible.
    log.warn('site_domain_resolve_failed', { spaceId: space.id, message: briefError(err) })
    return null
  }
}

/** The custom domain a Space's website is LIVE on: bound (boundSiteDomain) and published, the same test
 *  the Space profile's canonical uses (lib/spaces/profile-metadata.ts siteTwinCanonical). Null otherwise.
 *  No database read unless spaces.domain is set. The free subdomain redirects here (SCAN-896). */
export async function liveSiteDomain(space: Pick<Space, 'id' | 'domain' | 'preferences'> & ChapterFields): Promise<string | null> {
  if ((!space.domain && !space.parentId) || !readWebsitePublished(space.preferences)) return null
  return boundSiteDomain(space)
}
