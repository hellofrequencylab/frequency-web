import { getSpaceByDomain } from '@/lib/spaces/store'
import { normalizeHost, siteSlugFromSubdomain, spotlightHostDomain } from '@/lib/sites/host'
import { getSiteSpace } from '@/lib/sites/site-cache'
import type { Space } from '@/lib/spaces/types'

// THE HOSTED SITE RESOLVE (PROG-E10 phase 2). proxy.ts rewrites a site host to /hosted/<host>[/<page>]
// (lib/sites/host.ts). A custom domain resolves by DOMAIN, through getSpaceByDomain, so the
// custom_domain plan gate applies. A free website subdomain (`<slug>.frequencylocal.com`, LIVE-782)
// resolves by SLUG through getSiteSpace, the same anonymous, cached read /sites/<slug> uses: a missing
// or Private Space is null (404), and the publish gate stays in SitePage, so an unpublished site shows
// Coming soon on its subdomain exactly as everywhere else.
//
// WHO KEEPS /hosted/<domain> OFF FREQUENCY'S OWN HOST (PROG-E10 phase 5, LIVE-784). This used to read
// the request's Host header and answer only when it matched the path, so /hosted/<domain> typed on
// Frequency's host 404'd rather than becoming a second copy of somebody's site. Reading a header makes
// every site page render per request, which is the cost phase 5 removes, so the same rule now lives in
// the proxy: routeSiteHost answers `not-found` for any /hosted path on one of Frequency's own hosts,
// and a site host only reaches /hosted through the proxy's own rewrite of its own name.
export async function resolveHostedSpace(hostParam: string): Promise<Space | null> {
  const host = normalizeHost(decodeURIComponent(hostParam))
  if (!host) return null
  const slug = siteSlugFromSubdomain(host)
  if (slug) return getSiteSpace(slug)
  // `spotlight.<domain>` (LIVE-855) is the Space that holds <domain>, behind the same custom_domain gate.
  return getSpaceByDomain(spotlightHostDomain(host) ?? host)
}
