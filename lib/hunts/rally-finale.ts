/**
 * The Rally finale (FH-031): a Hunt that ends at an Event. Pure: no database, no Next, no network.
 *
 * The Event owns admission. A Hunt version may name ONE host Event (`hunt_versions.policy.finale.event_id`,
 * frozen with the version at publish), and this module only READS what the Events tables say about it:
 * the Event, its capacity, the player's RSVP and ticket rows, and attendance marked at that Event.
 * Nothing here can create a seat, a ticket, an RSVP or a check-in, so finishing a Hunt never admits
 * anyone. Finale access is the AND of two facts that neither side can fake for the other:
 *
 *   the run is complete   (the Hunt's fact)
 *   the player holds a seat at the host Event   (the Event's fact)
 *
 * Rules, each pinned by rally-finale.test.ts:
 * - A full Event admits nobody new. A finished player with no seat is told the Event is full.
 * - No ticket and no RSVP is no seat. A waitlist place and a request the host has not answered are not seats.
 * - A seat at any other Event does not count: every row is matched to the host Event id again here.
 * - A refunded ticket is not a seat, whatever status the row carries.
 * - A cancelled, unpublished or missing Event has no finale, and neither does an Event hosted by a
 *   Space that is not the Hunt's own Space or a live partner (lib/hunts/partners.ts).
 * - Door evidence (assurance `event_door`) exists only when the host marked the seat at this Event. A
 *   player's own check-in is recorded but is not door evidence.
 * - A completion award on a Hunt with a finale is granted only with that access (`grantFinaleReward`).
 *
 * THE FINALE BROADCAST (FH-032S). The notice that tells players the finale is on travels through the
 * Hunt outbox as an event of type `FINALE_BROADCAST_EVENT`. `finaleBroadcastState` reads the outbox
 * counts for that type and says what an organiser is told on route health. Nothing in this build
 * sends one yet (ledger row FH-032T), so a Hunt with a finale truthfully reads `not_sent`.
 */
import { isAdmitted, isPendingApproval } from '@/lib/events/admission'
import type { Assurance } from './apply-claim'
import { grantReward } from './rewards'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The host Event a published version names, or null when the Hunt has no finale. */
export function parseFinale(policy: unknown): { eventId: string } | null {
  const finale = (policy && typeof policy === 'object' ? (policy as { finale?: unknown }).finale : null) as { event_id?: unknown } | null | undefined
  const eventId = finale && typeof finale === 'object' ? finale.event_id : null
  return typeof eventId === 'string' && UUID.test(eventId) ? { eventId: eventId.toLowerCase() } : null
}

/** The outbox event type a finale announcement is sent as. Route health counts rows of this type. */
export const FINALE_BROADCAST_EVENT = 'finale.broadcast'

export type FinaleBroadcast = 'no_finale' | 'not_sent' | 'waiting' | 'sent' | 'failed'

/**
 * Did the finale broadcast go out? A failed row wins over everything, because it needs a replay; a
 * row still waiting or sending wins over rows already sent, because some players have not been told.
 */
export function finaleBroadcastState(
  finale: { eventId: string } | null,
  outbox: { pending: number; leased: number; done: number; dead: number },
): FinaleBroadcast {
  if (!finale) return 'no_finale'
  if (outbox.dead > 0) return 'failed'
  if (outbox.pending + outbox.leased > 0) return 'waiting'
  return outbox.done > 0 ? 'sent' : 'not_sent'
}

export type HostEvent = Readonly<{
  id: string
  title: string
  slug: string
  startsAt: string | null
  /** null = unlimited */
  capacity: number | null
  cancelled: boolean
  published: boolean
  /** The Space that hosts it (host_space_id, else space_id), or null for a member's own Event. */
  hostSpaceId: string | null
}>

export type FinaleRsvp = Readonly<{ id: string; eventId: string; status: string; approvalStatus: string; attendedAt: string | null }>
export type FinaleTicket = Readonly<{ id: string; eventId: string; status: string; refundedAt: string | null; attendedAt: string | null }>

/** Everything the projection reads. The store loads it fresh; rows for other Events are ignored here. */
export type FinaleFacts = Readonly<{
  finale: { eventId: string } | null
  event: HostEvent | null
  /** Confirmed going seats at the host Event, counted by the Events code (lib/events/capacity.ts). */
  going: number
  /** The player's own rows, from event_rsvps and event_tickets. */
  rsvps: readonly FinaleRsvp[]
  tickets: readonly FinaleTicket[]
  /** The player has a verified self check-in at the host Event (the engagement ledger). */
  selfCheckedIn: boolean
  runState: string
  huntOwnerSpaceId: string | null
  /** Spaces with a partner row in force on this Hunt right now. */
  livePartnerSpaceIds: readonly string[]
}>

type Admission = 'ticket' | 'rsvp' | 'waitlist' | 'pending' | 'refunded' | 'none'
type Attendance = 'host_marked' | 'self_checked_in' | 'none'
type FinaleRefusal = 'hunt_not_complete' | 'event_unavailable' | 'event_full' | 'waitlisted' | 'awaiting_host' | 'ticket_refunded' | 'no_seat'

export type FinaleProjection =
  | { kind: 'none' }
  | {
      kind: 'unavailable'
      access: { allowed: false; reason: 'event_unavailable' }
    }
  | {
      kind: 'finale'
      event: { id: string; title: string; slug: string; startsAt: string | null }
      capacity: { capacity: number | null; going: number; spotsLeft: number | null; isFull: boolean }
      admission: Admission
      attendance: Attendance
      /** The seat row the admission and the attendance mark came from. */
      seat: { kind: 'rsvp' | 'ticket'; id: string } | null
      access: { allowed: true; via: 'ticket' | 'rsvp' } | { allowed: false; reason: Exclude<FinaleRefusal, 'event_unavailable'> }
    }

const validTicket = (t: FinaleTicket) => t.status === 'succeeded' && t.refundedAt === null
const seatedRsvp = (r: FinaleRsvp) => r.status === 'going' && isAdmitted({ status: r.status, approval_status: r.approvalStatus })

/** Is this the Hunt's Event to end at? A Space-owned Hunt ends at its own Space's Event or a live partner's. */
function eventUsable(f: FinaleFacts, event: HostEvent): boolean {
  if (event.cancelled || !event.published) return false
  if (!f.huntOwnerSpaceId) return true
  return event.hostSpaceId === f.huntOwnerSpaceId || (!!event.hostSpaceId && f.livePartnerSpaceIds.includes(event.hostSpaceId))
}

/**
 * The finale as the Events tables describe it for one player. Reads only; returns what a screen shows
 * and whether the finale is open to this player.
 */
export function projectFinale(f: FinaleFacts): FinaleProjection {
  if (!f.finale) return { kind: 'none' }
  const event = f.event
  if (!event || event.id !== f.finale.eventId || !eventUsable(f, event)) {
    return { kind: 'unavailable', access: { allowed: false, reason: 'event_unavailable' } }
  }

  // The correct Event: a row for any other Event is dropped before anything is decided.
  const tickets = f.tickets.filter((t) => t.eventId === event.id)
  const rsvps = f.rsvps.filter((r) => r.eventId === event.id)

  const going = Math.max(0, f.going)
  const capacity = {
    capacity: event.capacity,
    going,
    spotsLeft: event.capacity === null ? null : Math.max(0, event.capacity - going),
    isFull: event.capacity !== null && going >= event.capacity,
  }

  const ticket = tickets.find(validTicket) ?? null
  const rsvp = rsvps.find(seatedRsvp) ?? null
  const refunded = tickets.some((t) => t.status === 'refunded' || t.refundedAt !== null)
  const admission: Admission = ticket
    ? 'ticket'
    : rsvp
      ? 'rsvp'
      : rsvps.some((r) => isPendingApproval({ approval_status: r.approvalStatus }))
        ? 'pending'
        : rsvps.some((r) => r.status === 'waitlist')
          ? 'waitlist'
          : refunded
            ? 'refunded'
            : 'none'

  // Attendance counts only on the seat that admits. A mark on a refunded ticket is not attendance.
  const seat = ticket ? { kind: 'ticket' as const, id: ticket.id } : rsvp ? { kind: 'rsvp' as const, id: rsvp.id } : null
  const marked = !!(ticket?.attendedAt ?? rsvp?.attendedAt)
  const attendance: Attendance = !seat ? 'none' : marked ? 'host_marked' : f.selfCheckedIn ? 'self_checked_in' : 'none'

  const refusal: Exclude<FinaleRefusal, 'event_unavailable'> | null =
    admission === 'ticket' || admission === 'rsvp'
      ? f.runState === 'completed' ? null : 'hunt_not_complete'
      : admission === 'pending'
        ? 'awaiting_host'
        : admission === 'waitlist'
          ? 'waitlisted'
          : admission === 'refunded'
            ? 'ticket_refunded'
            : capacity.isFull
              ? 'event_full'
              : 'no_seat'

  return {
    kind: 'finale',
    event: { id: event.id, title: event.title, slug: event.slug, startsAt: event.startsAt },
    capacity,
    admission,
    attendance,
    seat,
    access: refusal === null ? { allowed: true, via: admission as 'ticket' | 'rsvp' } : { allowed: false, reason: refusal },
  }
}

/**
 * Door evidence for an Event stop: only a seat at the host Event that the host marked present. The
 * evidence id names the Event and the seat, so the same mark can credit a mission once.
 */
export function finaleDoorEvidence(p: FinaleProjection): { evidenceId: string; assurance: Extract<Assurance, 'event_door'> } | null {
  if (p.kind !== 'finale' || !p.seat || p.attendance !== 'host_marked') return null
  return { evidenceId: `event-door:${p.event.id}:${p.seat.kind}:${p.seat.id}`, assurance: 'event_door' }
}

/** What a player reads when the finale is not open to them. Points at the Event, never promises a seat. */
export function finaleRefusalMessage(reason: FinaleRefusal): string {
  switch (reason) {
    case 'hunt_not_complete':
      return 'Finish the trail to unlock the finale.'
    case 'event_full':
      return 'The finale is full. Finishing the trail does not hold a place, so check the event page for the waitlist.'
    case 'waitlisted':
      return 'You are on the waitlist for the finale. You are in once a place opens for you.'
    case 'awaiting_host':
      return 'The host has not answered your request to join the finale yet.'
    case 'ticket_refunded':
      return 'Your ticket for the finale was refunded, so it no longer gets you in.'
    case 'no_seat':
      return 'The finale needs its own ticket or RSVP. Get yours on the event page.'
    default:
      return 'The finale is not available right now.'
  }
}

type GrantInput = Parameters<typeof grantReward>[1]
type GrantOutcome = Awaited<ReturnType<typeof grantReward>> | { result: 'not_admitted'; reason: FinaleRefusal; replayed: false }

/**
 * The completion award on a Hunt that may have a finale. With a finale, the award is granted only to a
 * player the Event admits; the database is not called otherwise. With no finale this is `grantReward`.
 */
export async function grantFinaleReward(rpc: Parameters<typeof grantReward>[0], input: GrantInput, projection: FinaleProjection): Promise<GrantOutcome> {
  if (projection.kind !== 'none' && !projection.access.allowed) {
    return { result: 'not_admitted', reason: projection.access.reason, replayed: false }
  }
  return grantReward(rpc, input)
}
