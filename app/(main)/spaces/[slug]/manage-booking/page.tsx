import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { FocusTemplate } from '@/components/templates'
import { GuestManageBooking } from '@/components/spaces/guest-booking-manage'
import { readGuestManagedBooking } from '@/lib/spaces/booking-guest-manage'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'

// THE GUEST MANAGE PAGE ON FREQUENCY (BOOK-007). A guest who booked a Space with no published website gets
// this link in their confirmation and reminder emails (lib/sites/site-booking.ts siteManageBookingUrl). It is
// the same page as the website's own app/hosted/[host]/manage-booking, with the same rules:
//
//   * OPENING THE LINK WRITES NOTHING (SCAN-858). Cancel and Move are buttons that post the token with this
//     Space's id, so a mail scanner that opens every link changes nothing, and a token for another Space is
//     refused.
//   * The Space resolves as an anonymous visitor sees it, the way the guest door does. A link with no token is
//     not found.
//   * Never cached (a secret in the query string) and never indexed. The token is never echoed into visible text.
//
// `manage-booking` is a reserved page slug (lib/spaces/profile-pages.ts), so no custom page shadows it.
// COPY: camp-counselor voice, no em dashes, no hex.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Your booking', robots: { index: false, follow: false } }

export default async function SpaceManageBookingPage({
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
  const view = await readGuestManagedBooking(token, space.id)

  return (
    <FocusTemplate width="narrow" title="Your booking" description="Cancel it, or move it to another open time.">
      <GuestManageBooking token={token} spaceId={space.id} view={view} bookHref={`/spaces/${encodeURIComponent(space.slug)}/book`} />
    </FocusTemplate>
  )
}
