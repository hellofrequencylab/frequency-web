import type { Metadata } from 'next'
import type { Space } from '@/lib/spaces/types'
import { getSiteSpace } from '@/lib/sites/site-cache'
import { appOrigin, normalizeHost, siteSlugFromSubdomain, spotlightHostDomain } from '@/lib/sites/host'
import { SITE_BOOK_SLUG, SITE_CONTACT_SLUG, siteHasContactPage } from '@/lib/sites/house-theme'
import { readSiteBooking } from '@/lib/sites/site-booking'
import { readWebsitePublished } from '@/lib/spaces/website'
import { readSpaceSpotlight } from '@/lib/spaces/spotlight'
import { setSpotlightSiteLinks } from '@/lib/spaces/spotlight-site'
import { setActiveSpace } from '@/lib/spaces/active-space'
import { readTagline } from '@/lib/spaces/tagline'
import { spaceCanTakePayments } from '@/lib/pricing/payments-gate'
import { SpaceSpotlight } from './space-spotlight'

// THE SPOTLIGHT ON A WEBSITE HOST (LIVE-855, owner ask 2026-10-07: "paid users got their own link like
// <slug>.frequencylocal.com/spotlight. Even better if Collective users have spotlight.theirwebsite.com").
// The hosted site route (app/hosted/[host]/[page]) hands its `spotlight` page here. Three hosts reach it:
//   • `<slug>.frequencylocal.com/spotlight`: needs a plan that takes payments (the paid link), checked here.
//   • `<domain>/spotlight` and `spotlight.<domain>`: the Space's own domain, already behind the custom_domain
//     gate in resolveHostedSpace.
// FAIL-CLOSED: an unpublished Spotlight, or a free Space on its subdomain, is null and the site route goes
// on as before (a 404, since `spotlight` is a reserved page slug). The Space is re-read through getSiteSpace,
// so the cached page carries the `site:<slug>` tag and the owner's Spotlight saves refresh it.

interface HostedSpotlight {
  space: Space
  /** The origin of the website this Spotlight belongs to, where Book and Contact live. */
  siteOrigin: string
  /** This Spotlight's own address on this host. */
  url: string
}

async function resolve(hostParam: string, resolved: Space): Promise<HostedSpotlight | null> {
  const host = normalizeHost(decodeURIComponent(hostParam))
  const space = await getSiteSpace(resolved.slug)
  if (!space || space.id !== resolved.id || !readSpaceSpotlight(space.preferences).published) return null
  if (siteSlugFromSubdomain(host) && !(await spaceCanTakePayments(space.id, { plan: space.plan ?? null }))) return null
  const domain = spotlightHostDomain(host)
  return domain
    ? { space, siteOrigin: `https://${domain}`, url: `https://${host}/` }
    : { space, siteOrigin: `https://${host}`, url: `https://${host}/spotlight` }
}

/** The Spotlight's metadata on a website host, or null when this host does not serve it. Branded as the
 *  Space, never Frequency, like the website's own pages. */
export async function hostedSpotlightMetadata(hostParam: string, resolved: Space): Promise<Metadata | null> {
  const hosted = await resolve(hostParam, resolved)
  if (!hosted) return null
  const { space, url } = hosted
  const name = space.brandName?.trim() || space.name
  const description = (await readTagline(space.id)) ?? name
  const image = space.coverImageUrl || space.brandLogoUrl || null
  return {
    title: { absolute: name },
    description,
    alternates: { canonical: url },
    robots: { index: true, follow: true },
    openGraph: { title: name, description, url, siteName: name, type: 'website', images: image ? [{ url: image, alt: name }] : undefined },
    twitter: { card: image ? 'summary_large_image' : 'summary', title: name, description, images: image ? [image] : undefined },
    ...(space.brandLogoUrl ? { icons: { icon: [{ url: space.brandLogoUrl }], apple: [{ url: space.brandLogoUrl }] } } : {}),
  }
}

/** The Spotlight page on a website host, or null when this host does not serve it. */
export async function HostedSpotlightPage({ host, space: resolved }: { host: string; space: Space }) {
  const hosted = await resolve(host, resolved)
  if (!hosted) return null
  const { space, siteOrigin } = hosted
  const site = readWebsitePublished(space.preferences)
  const takesBookings = site && (await readSiteBooking(space.id)).takesBookings
  const origin = appOrigin()
  setSpotlightSiteLinks({
    appOrigin: origin,
    book: takesBookings ? `${siteOrigin}/${SITE_BOOK_SLUG}` : null,
    contact: site && siteHasContactPage(space.preferences) ? `${siteOrigin}/${SITE_CONTACT_SLUG}` : null,
  })
  setActiveSpace(space)
  return <SpaceSpotlight space={space} tagline={await readTagline(space.id)} appOrigin={origin} />
}
