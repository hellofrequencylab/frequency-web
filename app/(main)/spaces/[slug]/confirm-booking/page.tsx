import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { FocusTemplate } from '@/components/templates'
import { ConfirmBookingForm } from '@/components/spaces/guest-booking-confirm-form'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'

// THE GUEST CONFIRM PAGE ON FREQUENCY (BOOK-003). A signed-out visitor books a public Space at
// /spaces/<slug>/book with a name and an email (the LIVE-835 guest door), and the hold email links here
// when the Space has no published website, because an unpublished site serves no confirm page
// (lib/sites/site-booking.ts siteConfirmBookingUrl). It is the same page as the website's own
// app/hosted/[host]/confirm-booking, with the same rules:
//
//   * OPENING THE LINK WRITES NOTHING (SCAN-858). The page shows a Confirm button that posts the token
//     with this Space's id (confirmGuestBookingFormAction), so a mail scanner that opens every link
//     confirms nothing, and a token minted for another Space is refused.
//   * The Space resolves as an anonymous visitor sees it, the way the guest door does, so a Private Space
//     (which never takes guest bookings) is not found. A link with no token is not found.
//   * Never cached (a one-time token in the query string) and never indexed. The token is never echoed
//     into visible text.
//
// `confirm-booking` is a reserved page slug (lib/spaces/profile-pages.ts), so no custom page shadows it.
// COPY: camp-counselor voice, no em dashes, no hex.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Confirm your booking', robots: { index: false, follow: false } }

export default async function SpaceConfirmBookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ token?: string | string[] }>
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams])
  const space = await getVisibleSpaceBySlug(slug, null)
  const token = typeof query.token === 'string' ? query.token.trim() : ''
  if (!space || !token) notFound()

  return (
    <FocusTemplate
      width="narrow"
      title="Confirm your booking"
      description="One tap and your time is set. We will email the details with a calendar file."
    >
      <ConfirmBookingForm token={token} spaceId={space.id} bookHref={`/spaces/${encodeURIComponent(space.slug)}/book`} />
    </FocusTemplate>
  )
}
