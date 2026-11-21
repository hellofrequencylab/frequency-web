import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { FocusTemplate } from '@/components/templates'
import { GuestManageBooking } from '@/components/spaces/guest-booking-manage'
import { resolveHostedSpace } from '@/lib/sites/hosted'
import { SITE_BOOK_SLUG } from '@/lib/sites/house-theme'
import { appOrigin } from '@/lib/sites/host'
import { readGuestManagedBooking } from '@/lib/spaces/booking-guest-manage'
import { readWebsitePublished } from '@/lib/spaces/website'

// THE WEBSITE'S MANAGE-BOOKING PAGE (BOOK-007). The link in a website guest's confirmation and reminder emails
// opens `/manage-booking?token=...` on the Space website's own host (the website stands alone, ADR-1723), which
// the proxy rewrites here. The guest cancels or moves their booking with no account; the token is the booking's
// guest secret (lib/spaces/booking-guest-manage.ts).
//
// OPENING THE LINK WRITES NOTHING (SCAN-858): Cancel and Move are buttons that post the token with this site's
// Space id, and a token minted for another Space reads as a link that did not work.
//
// Never cached (a secret in the query string). A static sibling of the `[page]` route, so no site page can take
// this slug (SITE_MANAGE_BOOKING_SLUG). A host that is not a site, or a link with no token, is not found. The
// token is never echoed into visible text. A Space with no published website gets the same page at
// app/(main)/spaces/[slug]/manage-booking on Frequency.
//
// COPY: camp-counselor voice, no em dashes, no hex, no word about Frequency (the website is the owner's).
export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Your booking', robots: { index: false, follow: false } }

export default async function ManageBookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ host: string }>
  searchParams: Promise<{ token?: string | string[] }>
}) {
  const [{ host }, query] = await Promise.all([params, searchParams])
  const space = await resolveHostedSpace(host)
  const token = typeof query.token === 'string' ? query.token.trim() : ''
  if (!space || !token) notFound()
  const view = await readGuestManagedBooking(token, space.id)

  return (
    <FocusTemplate width="narrow" title="Your booking" description="Cancel it, or move it to another open time.">
      <GuestManageBooking
        token={token}
        spaceId={space.id}
        view={view}
        bookHref={
          readWebsitePublished(space.preferences)
            ? `/${SITE_BOOK_SLUG}`
            : `${appOrigin()}/spaces/${encodeURIComponent(space.slug)}/${SITE_BOOK_SLUG}`
        }
      />
    </FocusTemplate>
  )
}
