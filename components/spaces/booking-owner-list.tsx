import { CalendarClock } from 'lucide-react'
import { listSpaceBookings, getSpaceBookingTimezone, type SpaceBooking } from '@/lib/spaces/booking'
import { EmptyState } from '@/components/ui/empty-state'
import { BookingCancelButton } from '@/components/spaces/booking-cancel-button'
import { BookingNoShowButton } from '@/components/spaces/booking-no-show-button'

// OWNER BOOKINGS LIST (ENTITY-SPACES-SYSTEM section 2.4, booking v1). A self-fetching server
// component for the owner availability surface: the Practitioner's confirmed bookings (member name,
// service, time), gated on canEditProfile inside listSpaceBookings. Upcoming rows carry Cancel (the
// booker or a space admin may cancel; the owner is always an admin of their Space). BOOK-012: a Past
// group shows the last 30 days, newest first, where a member's booking can be marked as a no-show.
// Times are shown in the Space's configured timezone, labeled. No em/en dashes (CONTENT-VOICE).

function timezoneLabel(timezone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'short',
    }).formatToParts(new Date())
    return parts.find((p) => p.type === 'timeZoneName')?.value ?? timezone
  } catch {
    return timezone
  }
}

export async function BookingOwnerList({ spaceId }: { spaceId: string }) {
  const [bookings, timezone] = await Promise.all([
    listSpaceBookings(spaceId),
    getSpaceBookingTimezone(spaceId),
  ])

  if (bookings.length === 0) {
    return (
      <EmptyState
        icon={CalendarClock}
        title="No bookings yet."
        description="When a member books one of your open times, it shows here."
      />
    )
  }

  const tzLabel = timezoneLabel(timezone)
  const whenFmt = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
  const upcoming = bookings.filter((b) => !b.past)
  const past = bookings.filter((b) => b.past).reverse()

  const row = (b: SpaceBooking) => (
    <li key={b.id} className="flex items-center justify-between gap-4 px-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-body-sm font-semibold text-text">{b.memberName}</p>
        {/* A guest who booked on the website (LIVE-835) has no profile: show the address they gave. */}
        {b.guestEmail && (
          <p className="truncate text-meta text-muted">
            {b.guestEmail} · {b.awaitingGuestConfirmation ? "Awaiting the guest's confirmation" : 'Website booking'}
          </p>
        )}
        <p className="text-meta text-muted">
          {b.serviceName ? `${b.serviceName} · ` : ''}
          {whenFmt.format(new Date(b.startsAt))} ({tzLabel})
        </p>
        {b.note && <p className="mt-1 line-clamp-2 text-meta text-subtle">{b.note}</p>}
        {b.answers.length > 0 && (
          <dl className="mt-1.5 space-y-0.5">
            {b.answers.map((a) => (
              <div key={a.id} className="text-meta">
                <dt className="inline font-semibold text-muted">{a.label}: </dt>
                <dd className="inline text-subtle">{a.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
      {b.past ? (
        b.noShow ? (
          <span className="shrink-0 text-meta font-semibold text-muted">No-show</span>
        ) : (
          // Only a member has a Space record to carry the mark; a website guest does not.
          b.memberProfileId ? <BookingNoShowButton bookingId={b.id} /> : null
        )
      ) : (
        // SCAN-834: an unconfirmed guest hold lapses on its own within the hour; nothing to cancel yet.
        b.awaitingGuestConfirmation ? null : <BookingCancelButton bookingId={b.id} />
      )}
    </li>
  )

  return (
    <div className="space-y-4">
      {upcoming.length > 0 ? (
        <ul className="divide-y divide-border rounded-card border border-border bg-surface lift-1">{upcoming.map(row)}</ul>
      ) : (
        <p className="text-meta text-muted">No upcoming bookings yet.</p>
      )}
      {past.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-meta font-semibold text-muted">Past 30 days</h3>
          <ul className="divide-y divide-border rounded-card border border-border bg-surface lift-1">{past.map(row)}</ul>
        </section>
      )}
    </div>
  )
}
