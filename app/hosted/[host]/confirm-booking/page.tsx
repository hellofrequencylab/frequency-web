import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { FocusTemplate } from '@/components/templates'
import { resolveHostedSpace } from '@/lib/sites/hosted'
import { SITE_BOOK_SLUG } from '@/lib/sites/house-theme'
import { ConfirmBookingForm } from './confirm-form'

// THE WEBSITE'S CONFIRM-BOOKING PAGE (SCAN-834, owner ruling 2026-10-12). The link in a guest's "Confirm
// your booking" email opens `/confirm-booking?token=...` on the Space website's own host (the website stands
// alone, ADR-1723), which the proxy rewrites here. Confirming proves the address the guest typed, so only
// then do the confirmation email, the reminder and the Space CRM lead happen (lib/spaces/booking.ts,
// confirmGuestBooking).
//
// OPENING THE LINK WRITES NOTHING (SCAN-858). It used to confirm during this render, and mail scanners
// (Outlook Safe Links and the like) open every emailed link, so a slot booked with someone else's address was
// confirmed with nobody pressing anything. The page now shows a Confirm button that posts the token with this
// site's Space id, and a token minted for another Space is refused rather than confirmed under this site.
//
// Never cached: it reads a one-time token from the query string. A static sibling of the `[page]` route, so
// no site page can take this slug (SITE_CONFIRM_BOOKING_SLUG). A host that is not a site, or a link with no
// token at all, is not found. The token is never echoed into visible text.
//
// COPY: camp-counselor voice, no em dashes, no hex, no word about Frequency (the website is the owner's).
export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Confirm your booking', robots: { index: false, follow: false } }

export default async function ConfirmBookingPage({
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

  return (
    <FocusTemplate
      width="narrow"
      title="Confirm your booking"
      description="One tap and your time is set. We will email the details with a calendar file."
    >
      <ConfirmBookingForm token={token} spaceId={space.id} bookHref={`/${SITE_BOOK_SLUG}`} />
    </FocusTemplate>
  )
}
