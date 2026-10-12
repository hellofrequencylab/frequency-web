import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { CalendarCheck, CalendarX } from 'lucide-react'
import { FocusTemplate } from '@/components/templates'
import { buttonClasses } from '@/components/ui/button'
import { resolveHostedSpace } from '@/lib/sites/hosted'
import { confirmGuestBookingAction } from '@/lib/spaces/booking-actions'
import { getPublicSpaceBookingTimezone } from '@/lib/spaces/booking'
import { SITE_BOOK_SLUG } from '@/lib/sites/house-theme'

// THE WEBSITE'S CONFIRM-BOOKING PAGE (SCAN-834, owner ruling 2026-10-12). The link in a guest's "Confirm
// your booking" email opens `/confirm-booking?token=...` on the Space website's own host (the website stands
// alone, ADR-1723), which the proxy rewrites here. The click is the whole point: it proves the address the
// guest typed, so this page flips the hold to a booking, and only then do the confirmation email, the
// reminder and the Space CRM lead happen (lib/spaces/booking.ts, confirmGuestBooking).
//
// Never cached: it reads a one-time token from the query string and writes on a valid one. A static sibling
// of the `[page]` route, so no site page can take this slug (SITE_CONFIRM_BOOKING_SLUG). A host that is not
// a site, or a link with no token at all, is not found; a bad or lapsed token renders a plain explanation
// with the way back to the Book page. The token is never echoed into the page.
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

  const outcome = await confirmGuestBookingAction(token)
  const bookHref = `/${SITE_BOOK_SLUG}`

  if (!outcome.ok) {
    const expired = outcome.reason === 'expired'
    return (
      <FocusTemplate
        width="narrow"
        title={expired ? 'That hold has lapsed.' : 'That link did not work.'}
        description={
          expired
            ? 'We held your time for thirty minutes and the clock ran out. The time is open again, so pick it, or another, and we will send a fresh link.'
            : 'The link may be incomplete or already used. Pick a time again and we will send a fresh one.'
        }
      >
        <div className="rounded-card border border-border bg-surface px-6 py-8 text-center">
          <CalendarX className="mx-auto mb-3 h-8 w-8 text-muted" aria-hidden />
          <a href={bookHref} className={buttonClasses('primary', 'md')}>
            Pick a time
          </a>
        </div>
      </FocusTemplate>
    )
  }

  const timezone = await getPublicSpaceBookingTimezone(outcome.spaceId)
  const when = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(outcome.startsAt))
  const already = outcome.state === 'already'

  return (
    <FocusTemplate
      width="narrow"
      title={already ? 'You are already booked.' : 'You are booked.'}
      description={
        already
          ? `This time with ${outcome.spaceName} was confirmed earlier. Your confirmation email has the details.`
          : `Your time with ${outcome.spaceName} is set. Your confirmation email, with a calendar file, is on its way.`
      }
    >
      <div className="rounded-card border border-success/30 bg-success-bg px-6 py-8 text-center">
        <CalendarCheck className="mx-auto mb-3 h-8 w-8 text-success" aria-hidden />
        <p className="text-body-sm font-semibold text-text">{outcome.serviceName ?? `Session with ${outcome.spaceName}`}</p>
        <p className="mt-1 text-body-sm text-muted">{when}</p>
        <a href={bookHref} className={`mt-4 inline-block ${buttonClasses('secondary', 'sm')}`}>
          Book another time
        </a>
      </div>
    </FocusTemplate>
  )
}
