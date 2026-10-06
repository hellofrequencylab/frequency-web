import { getSpaceByDomain } from '@/lib/spaces/store'
import { briefError, log } from '@/lib/log'
import { isAppHost, normalizeHost } from '@/lib/sites/host'
import type { Space } from '@/lib/spaces/types'

// IS THIS SPACE'S WEBSITE SERVED ON ITS OWN DOMAIN? (PROG-E10 phase 4, LIVE-783)
//
// The site's canonical origin is the Space's domain only when a request to that domain would really
// reach this Space's site: spaces.domain is set, it is not one of Frequency's own hosts, and
// getSpaceByDomain resolves it back to THIS Space (which is where the custom_domain plan gate lives,
// so a Space that lost the gate stops claiming a domain it no longer serves). Anything else is the
// /sites/<slug> origin. The domain read only runs when spaces.domain is set, which is rare.

/** The bound domain of a Space's website, or null when the site lives at /sites/<slug>. */
export async function boundSiteDomain(space: Pick<Space, 'id' | 'domain'>): Promise<string | null> {
  const domain = normalizeHost(space.domain)
  if (!domain || isAppHost(domain)) return null
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
