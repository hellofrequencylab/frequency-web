// A Space website's LIVE CUSTOM DOMAIN, as one cached JSON answer (LIVE-SUBDOMAIN-ATTRIBUTION). The proxy
// asks this when a visit to `<slug>.frequencylocal.com` carries a campaign tag, so it can send the visitor
// to the same page on the live domain with the tag intact (lib/sites/host.ts subdomainAttributionHop).
// Public data only: the domain is the one the website already redirects to. Cached like a site page
// (force-static, an hour) and expired with it: refreshSite (lib/sites/site-cache.ts) revalidates this
// path beside the site tree, so an owner's domain change is answered within the same breath the pages are.
// The decision is the same liveSiteDomain the ISR pages make, so eligibility (published, bound, plan) is
// decided in one place; this route only repeats it.
import { NextResponse } from 'next/server'
import { getSiteSpace } from '@/lib/sites/site-cache'
import { liveSiteDomain } from '@/lib/sites/site-domain'

export const dynamic = 'force-static'
export const revalidate = 3600

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const space = /^[a-z0-9][a-z0-9-]{0,62}$/.test(slug) ? await getSiteSpace(slug) : null
  const domain = space ? await liveSiteDomain(space) : null
  return NextResponse.json({ domain }, { headers: { 'cache-control': 'public, s-maxage=3600, stale-while-revalidate=86400' } })
}
