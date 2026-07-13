import { listMyBookings, getSpaceBookingTimezone } from '@/lib/spaces/booking'
import { BookingMineList } from '@/components/spaces/booking-mine-list'

// MEMBER'S OWN BOOKINGS (server, P3, ADR-605). Self-fetching: the current member's upcoming confirmed
// bookings with this Space, above the picker. Renders nothing when the member has none, so it never
// clutters a first-time booker's view. Cancel / reschedule live in the client list.

export async function BookingMine({ spaceId }: { spaceId: string }) {
  const bookings = await listMyBookings(spaceId)
  if (bookings.length === 0) return null
  const timezone = await getSpaceBookingTimezone(spaceId)

  return (
    <div className="mb-6 space-y-2">
      <h3 className="text-sm font-bold tracking-tight text-text">Your upcoming bookings</h3>
      <BookingMineList spaceId={spaceId} bookings={bookings} timezone={timezone} />
    </div>
  )
}
