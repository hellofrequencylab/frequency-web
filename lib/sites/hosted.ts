import { permanentRedirect, redirect } from 'next/navigation'
import { getSpaceByDomain } from '@/lib/spaces/store'
import { appOrigin, chapterHostParts, normalizeHost, siteSlugFromSubdomain, spotlightHostDomain, subdomainSiteRedirect } from '@/lib/sites/host'
import { isNetworkPlan } from '@/lib/collective/member-spaces'
import { getSiteSpace } from '@/lib/sites/site-cache'
import { liveSiteDomain } from '@/lib/sites/site-domain'
import { readWebsitePublished } from '@/lib/spaces/website'
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
  const spotlightOf = spotlightHostDomain(host)
  const direct = await getSpaceByDomain(spotlightOf ?? host)
  if (direct || spotlightOf) return direct
  return resolveChapterSpace(host)
}

/** A Network's chapter on `<chapter slug>.<the Network's domain>` (lib/sites/host.ts networkChapterHost).
 *  The Network must hold the domain (getSpaceByDomain, behind the custom_domain gate) and the chapter must
 *  be one of its own same-owner children, so a slug on someone else's domain, or another Network's
 *  chapter, resolves to nothing. The chapter is the same anonymous cached read /sites/<slug> uses. */
async function resolveChapterSpace(host: string): Promise<Space | null> {
  const parts = chapterHostParts(host)
  if (!parts) return null
  const network = await getSpaceByDomain(parts.networkDomain)
  if (!network || !isNetworkPlan(network.plan)) return null
  // The chapter's slug is usually the Network's slug plus the label (`the-group-encinitas` for `encinitas`).
  const chapter = (await getSiteSpace(`${network.slug}-${parts.label}`)) ?? (await getSiteSpace(parts.label))
  if (!chapter || chapter.parentId !== network.id || chapter.ownerProfileId !== network.ownerProfileId) return null
  return chapter
}

/** ONE SITE, ONE ADDRESS (SCAN-896). On a Space's free subdomain whose website is live on its own
 *  domain, a page 308s to the same page there (lib/sites/host.ts subdomainSiteRedirect decides). Called
 *  from the site's page routes, where the host is a route param, so the pages stay ISR: the domain check
 *  runs once per render, beside the same boundSiteDomain read siteMetadata already makes, and the
 *  redirect is cached with the page. The `site:<slug>` tag the owner's domain change expires re-renders
 *  it. The query string is not visible to a static page, so it is not carried. Not in the proxy: the
 *  proxy has no cached host-to-Space read and runs on every request. */
export async function redirectSubdomainToLiveDomain(hostParam: string, space: Space, pathname: string): Promise<void> {
  const host = normalizeHost(decodeURIComponent(hostParam))
  if (!siteSlugFromSubdomain(host)) return
  const target = subdomainSiteRedirect(host, pathname, '', await liveSiteDomain(space))
  if (target) permanentRedirect(target)
}

/** A CHAPTER'S ADDRESS IS ITS SPACE PAGE (owner 2026-10-22: "It's a Space page for the sub group"). On
 *  `<chapter>.<the Network's domain>` a chapter that has not published a website of its own sends the visitor
 *  to its Space page on Frequency, rather than a Coming soon site; one that has published a website serves
 *  it. A 307, not a 308, because publishing a website changes the answer. Called from the site's page routes
 *  like redirectSubdomainToLiveDomain, so the pages stay ISR and the `site:<slug>` tag re-decides it. */
export async function redirectChapterToSpacePage(hostParam: string, space: Space, pathname: string): Promise<void> {
  const host = normalizeHost(decodeURIComponent(hostParam))
  if (!space.parentId || !chapterHostParts(host) || siteSlugFromSubdomain(host) || space.domain === host) return
  if (readWebsitePublished(space.preferences)) return
  const rest = pathname === '/' ? '' : pathname
  redirect(`${appOrigin()}/spaces/${space.slug}${rest}`)
}
