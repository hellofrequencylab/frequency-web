import 'server-only'
import { readPublicBookingSetup, type ServiceType } from '@/lib/spaces/booking'
import { SITE_BOOK_SLUG, siteTakesBookings } from '@/lib/sites/house-theme'
import { appOrigin } from '@/lib/sites/host'
import { siteBaseUrl, sitePageUrl } from '@/lib/sites/seo'
import { boundSiteDomain } from '@/lib/sites/site-domain'
import type { Space } from '@/lib/spaces/types'

// THE WEBSITE'S BOOK PAGE (LIVE-835). Owner ask 2026-10-07: "If someone clicks book, that happens through the
// site. ... The website is stand alone." A Space website serves `/book` (SITE_BOOK_SLUG) when the Space takes
// bookings, and a visitor books there with a name and an email, no Frequency account. This module holds the
// two server reads the page and the booking mail share: what the page lists, and the page's own URL (the
// link a guest's confirmation and reminder carry, so the guest is never sent to Frequency).

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

/** The absolute URL of a Space website's Book page, on the site's one canonical origin (its bound domain,
 *  else its free subdomain). */
export async function siteBookUrl(space: Pick<Space, 'id' | 'slug'> & { domain?: string | null }): Promise<string> {
  const base = siteBaseUrl(space.slug, await boundSiteDomain({ id: space.id, domain: space.domain ?? null }), appOrigin())
  return sitePageUrl(base, SITE_BOOK_SLUG)
}
