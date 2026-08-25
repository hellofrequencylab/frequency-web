import { createAdminClient } from '@/lib/supabase/admin'

// Capacity / waitlist helpers for events. `events.capacity` + the 'waitlist' RSVP
// status are in the generated DB types (lib/database.types.ts) now, so the admin
// client is used directly and fully typed. The guest-seat columns are not yet, so
// the one read that needs them casts its payload (ADR-246).
//
// Capacity is identity-blind on purpose: the enforce_event_rsvp_capacity trigger
// counts 'going' rows, and a guest seat is a going row. A guest occupies a real
// place in the room and a real place in the waitlist queue, so every helper here
// counts them and promoteFromWaitlist can hand back either identity.

export interface CapacityInfo {
  /** null = unlimited */
  capacity: number | null
  /** confirmed 'going' RSVP rows */
  going: number
  /** remaining spots; null = unlimited */
  spotsLeft: number | null
  isFull: boolean
}

export async function getCapacityInfo(eventId: string): Promise<CapacityInfo> {
  const admin = createAdminClient()
  const [evRes, countRes] = await Promise.all([
    admin.from('events').select('capacity').eq('id', eventId).maybeSingle(),
    // 🔴 A PENDING REQUEST DOES NOT HOLD A SEAT (SCAN-105, ADR-1148, owner ruling 2026-08-25).
    // On an approval-gated event an unapproved answer is written as status 'going' with
    // approval_status 'pending', so counting `status = going` alone let TWENTY unapproved
    // REQUESTS fill a twenty-seat event the host had not said yes to — and the host could then
    // not approve anyone, because their own event read as full.
    //
    // It also contradicted the published promise. content/help/groups/events.md tells hosts
    // "A full event still sends approved people to the waitlist. Approving says 'yes, you are
    // welcome', not 'there is room'" — which is only true if approval, not the request, is what
    // consumes the seat.
    //
    // `approval_status` is NOT NULL with default 'none', so a plain neq is complete: every
    // ungated RSVP carries 'none' and is counted, and only 'pending' is withheld.
    admin
      .from('event_rsvps')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', eventId)
      .eq('status', 'going')
      .neq('approval_status', 'pending'),
  ])

  const capacity: number | null =
    typeof evRes.data?.capacity === 'number' ? evRes.data.capacity : null
  const going = countRes.count ?? 0
  const spotsLeft = capacity == null ? null : Math.max(0, capacity - going)
  const isFull = capacity != null && going >= capacity

  return { capacity, going, spotsLeft, isFull }
}

/**
 * The seat a promotion actually moved. Exactly ONE of the two identities is set
 * (event_rsvps_identity_check, 20270303000000): a member seat carries `profileId`,
 * a signed-out guest seat carries `guestEmail`. `rsvpId` is the row itself, so a
 * caller can stamp or re-read it without guessing which identity it was.
 */
export interface PromotedSeat {
  rsvpId: string
  profileId: string | null
  guestEmail: string | null
}

/**
 * Promote the oldest waitlisted RSVP to 'going' when a spot frees up.
 * Returns the promoted seat (so the caller can notify whichever identity holds
 * it), or null when there was nobody to promote.
 * Best-effort, low-volume: capacity is checked again before promoting.
 *
 * This used to return `profile_id ?? null`, which collapsed two opposite outcomes
 * into the same value once guest seats existed: promoting a GUEST off the waitlist
 * updated the row and then reported `null`, indistinguishable from "the waitlist
 * was empty". The seat moved and nobody could be told — and the guest, who has no
 * account, no bell and no "my events" page, would only find out by turning up.
 * Returning the row keeps "nothing happened" (null) separate from "someone was
 * promoted" (a seat), whichever identity that someone has.
 */
export async function promoteFromWaitlist(eventId: string): Promise<PromotedSeat | null> {
  const { isFull } = await getCapacityInfo(eventId)
  if (isFull) return null

  const admin = createAdminClient()
  // guest_email postdates the generated types, so the row is read untyped and cast to the
  // shape used here (ADR-246, same seam as lib/events/cancellation.ts).
  // ⚠️ AND PROMOTION MUST NOT BYPASS THE APPROVAL GATE (SCAN-105). This read used to take the
  // oldest waitlist row whatever its approval state, so a STILL-PENDING request could be lifted
  // straight into a confirmed seat by someone else's cancellation — approval granted by timing
  // rather than by the host. Skipping pending rows means the next APPROVED person moves up, and a
  // pending one waits for the host either way.
  const { data: nextRaw } = await admin
    .from('event_rsvps')
    .select('id, profile_id, guest_email')
    .eq('event_id', eventId)
    .eq('status', 'waitlist')
    .neq('approval_status', 'pending')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  const next = nextRaw as unknown as {
    id: string; profile_id: string | null; guest_email: string | null
  } | null

  if (!next) return null
  await admin.from('event_rsvps').update({ status: 'going' }).eq('id', next.id)
  return {
    rsvpId: next.id,
    profileId: next.profile_id ?? null,
    guestEmail: next.guest_email ?? null,
  }
}
