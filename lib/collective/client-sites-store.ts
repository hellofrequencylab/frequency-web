import { createAdminClient } from '@/lib/supabase/admin'
import { spaceHasEntitlement } from '@/lib/spaces/entitlements'
import { readWebsitePublished } from '@/lib/spaces/website'
import { BADGE_REMOVAL_ENTITLEMENT } from '@/lib/sites/site-badge'
import { boundSiteDomain } from '@/lib/sites/site-domain'
import { clientSiteDomainState, type ClientSiteRow } from './client-sites'

/** The live client websites a Network resells, newest first. Service-role read, bound to the Network id; the
 *  page authorizes the viewer as the Network's owner before calling. FAIL-SAFE: an error reads as none. */
export async function listClientSites(networkId: string): Promise<ClientSiteRow[]> {
  const result = await createAdminClient().from('spaces')
    .select('id, slug, name, domain, preferences, entitlements, owner_profile_id')
    .eq('reseller_network_id', networkId).eq('status', 'active').order('created_at', { ascending: false })
  if (result.error || !result.data) return []
  // A domain read only runs for a site that has one saved (most do not).
  return Promise.all(result.data.map(async (r) => ({
    id: r.id, slug: r.slug, name: r.name, domain: r.domain, ownerProfileId: r.owner_profile_id,
    published: readWebsitePublished(r.preferences),
    badgeFree: spaceHasEntitlement({ entitlements: r.entitlements }, BADGE_REMOVAL_ENTITLEMENT),
    domainState: clientSiteDomainState(r.domain, r.domain ? !!(await boundSiteDomain({ id: r.id, domain: r.domain })) : false),
  })))
}
