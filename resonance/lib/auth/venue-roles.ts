import { getVenue, listSeats } from "@/lib/dj/repo";

/**
 * Decide whether a user is the host of a venue. A user is the host when EITHER:
 * - they are the venue's `createdBy` (the venue creator owns it), OR
 * - the venue has a null `createdBy` (legacy venues predate ownership), in which
 *   case the occupant of the lowest seat index is treated as the host. This
 *   matches how watch parties treat the first seated occupant as the host.
 *
 * Returns false when the venue is missing.
 */
export async function isVenueHost(venueId: string, userId: string): Promise<boolean> {
  const venue = await getVenue(venueId);
  if (!venue) return false;

  if (venue.createdBy) return venue.createdBy === userId;

  // Legacy venue: the lowest-seat occupant is the host.
  const seats = await listSeats(venueId);
  if (seats.length === 0) return false;
  const host = [...seats].sort((a, b) => a.seatIndex - b.seatIndex)[0];
  return host.occupantUserId === userId;
}
