import { CalendarClock } from 'lucide-react'
import { listSpaceBookings, getSpaceBookingTimezone } from '@/lib/spaces/booking'
import { EmptyState } from '@/components/ui/empty-state'
import { BookingCancelButton } from '@/components/spaces/booking-cancel-button'

// OWNER BOOKINGS LIST (ENTITY-SPACES-SYSTEM section 2.4, booking v1). A self-fetching server
// component for the owner availability surface: the Practitioner's UPCOMING confirmed bookings
// (member name + time), gated on canEditProfile inside listSpaceBookings. Each row carries a Cancel
// affordance (the booker or a space admin may cancel; the owner is always an admin of their Space).
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
        title="No upcoming bookings yet."
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

  return (
    <ul className="divide-y divide-border rounded-2xl border border-border bg-surface shadow-sm">
      {bookings.map((b) => (
        <li key={b.id} className="flex items-center justify-between gap-4 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-text">{b.memberName}</p>
            <p className="text-xs text-muted">
              {whenFmt.format(new Date(b.startsAt))} ({tzLabel})
            </p>
            {b.note && <p className="mt-1 line-clamp-2 text-xs text-subtle">{b.note}</p>}
          </div>
          <BookingCancelButton bookingId={b.id} />
        </li>
      ))}
    </ul>
  )
}
