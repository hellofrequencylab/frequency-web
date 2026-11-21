import 'server-only'
import { readPublicBookingSetup, type ServiceType } from '@/lib/spaces/booking'
import { SITE_BOOK_SLUG, SITE_CONFIRM_BOOKING_SLUG, siteTakesBookings } from '@/lib/sites/house-theme'
import { appOrigin } from '@/lib/sites/host'
import { guestBookingPageUrl, siteBaseUrl } from '@/lib/sites/seo'
import { getSiteSpace } from '@/lib/sites/site-cache'
import { boundSiteDomain } from '@/lib/sites/site-domain'
import { readWebsitePublished } from '@/lib/spaces/website'
import type { Space } from '@/lib/spaces/types'

// THE WEBSITE'S BOOK PAGE (LIVE-835). Owner ask 2026-10-07: "If someone clicks book, that happens through the
// site. ... The website is stand alone." A Space website serves `/book` (SITE_BOOK_SLUG) when the Space takes
// bookings, and a visitor books there with a name and an email, no Frequency account. This module holds the
// two server reads the page and the booking mail share: what the page lists, and the page's own URL (the
// link a guest's confirmation and reminder carry, so the guest is never sent to Frequency while the website
// is live). BOOK-003: a Space with no published website takes guest bookings on /spaces/<slug>/book, and its
// guests' links open there and at /spaces/<slug>/confirm-booking, because an unpublished site serves neither.

interface SiteBooking {
  /** Whether the site serves `/book` (siteTakesBookings). */
  takesBookings: boolean
  /** The Space's active services, in the owner's order. Empty means the flat time picker. */
  services: ServiceType[]
  /** The Space's booking timezone, labeled in the picker. */
  timezone: string
}

/** What a published Space's Book page shows. Server-only; the caller already resolved the Space as an
 *  anonymous visitor would (getSiteSpace), so a Private Space never reaches here. FAIL-SAFE to "takes no
 *  bookings", which 404s the page. */
export async function readSiteBooking(spaceId: string): Promise<SiteBooking> {
  const setup = await readPublicBookingSetup(spaceId)
  return {
    takesBookings: siteTakesBookings({ serviceCount: setup.services.length, windowCount: setup.windowCount }),
    services: setup.services,
    timezone: setup.timezone,
  }
}

type GuestLinkSpace = Pick<Space, 'id' | 'slug'> & { domain?: string | null; parentId?: string | null; ownerProfileId?: string | null }

/** The absolute URL of one guest booking page (BOOK-003, lib/sites/seo.ts guestBookingPageUrl): on the
 *  site's one canonical origin (its bound domain, else its free subdomain) while the website is published,
 *  else on the Space page on Frequency, where /book and /confirm-booking both answer. The publish flag
 *  comes from the cached site read (getSiteSpace), so a mail costs no extra query on a warm cache. */
async function guestBookingUrl(space: GuestLinkSpace, pageSlug: string): Promise<string> {
  const [bound, site] = await Promise.all([
    boundSiteDomain({ id: space.id, slug: space.slug, domain: space.domain ?? null, parentId: space.parentId, ownerProfileId: space.ownerProfileId }),
    getSiteSpace(space.slug).catch(() => null),
  ])
  const base = siteBaseUrl(space.slug, bound, appOrigin())
  return guestBookingPageUrl(base, readWebsitePublished(site?.preferences), appOrigin(), space.slug, pageSlug)
}

/** The absolute URL of the Book page a guest's emails link to: the Space website's own when it is
 *  published, else the Space's Book page on Frequency (BOOK-003). */
export async function siteBookUrl(space: GuestLinkSpace): Promise<string> {
  return guestBookingUrl(space, SITE_BOOK_SLUG)
}

/** The link in a guest's "Confirm your booking" email (SCAN-834), carrying the hold's one-time token: the
 *  website's own confirm page when the website is published, else /spaces/<slug>/confirm-booking on
 *  Frequency (BOOK-003), so a Space with no website still gets a link that works. */
export async function siteConfirmBookingUrl(space: GuestLinkSpace, token: string): Promise<string> {
  return `${await guestBookingUrl(space, SITE_CONFIRM_BOOKING_SLUG)}?token=${encodeURIComponent(token)}`
}
