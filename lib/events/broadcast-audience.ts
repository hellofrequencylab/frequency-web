import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { listEventCrmMemberIds } from '@/lib/events/crm-roster'
import type { BroadcastSegment } from '@/components/comms/broadcast-types'

// THE EVENT BROADCAST AUDIENCE (Message everyone, ADR-827 ruling 3). The segments the event
// hub's broadcast composer offers, and the ONE server-side resolver its send action trusts.
// Segments integrate the ticketing system alongside the RSVP roster (owner refinement):
//
//   attendees        — everyone RSVP'd going or maybe (the Message Attendees audience,
//                      via listEventCrmMemberIds, the same set the CRM roster reads)
//   tickets          — everyone holding a succeeded ticket (event_tickets, the same ledger
//                      the sold count reads in lib/events/event-stats.ts)
//   tier:<id>        — one tier's holders (event_tickets.ticket_type_id), offered only when
//                      more than one tier actually has holders (a single-tier event's tier
//                      chip would duplicate "Ticket holders")
//   checked-in       — distinct members with a verified check-in (the engagement_events
//                      ledger, the exact query loadEventCoreStats runs)
//
// Every segment is deduped by profile id; the composer unions selected segments client-side
// for the live count, and resolveEventBroadcastAudience re-unions them server-side at send
// (never trusting client ids). Service-role reads behind the caller's event-manage gate.
// FAIL-SAFE: any read degrades to an empty segment, never a throw.
//
// ── THE GUEST TICKET HOLDER (LIVE-320) ──────────────────────────────────────────────────
// Since the guest door (20270345003400) a succeeded ticket row can carry `guest_email` and a NULL
// buyer: a signed-out purchase, and the address is the only way to reach that person. This file
// used to drop every null-buyer row on a comment written when null meant a deleted account. Now
// a row is one of three things, decided in `ticketIdentity` and nowhere else:
//   · a MEMBER  (buyer set)                     -> `profileIds`, exactly as before;
//   · a GUEST   (buyer null, guest_email set)   -> `guestEmails`, lowercased and deduped;
//   · a deleted account (neither)               -> dropped, as before.
// A guest ticket that has been claimed carries BOTH (claim_guest_tickets fills the buyer and leaves
// the address); the buyer wins, so the person is reached once, through their account. Only a
// `succeeded` ticket counts: the read filters on status, and the pure half refuses a row that says
// it is refunded (status or refunded_at) so a refunded ticket can never be mailed even if a caller
// hands it rows it did not filter. A guest address is reachable by EMAIL only; the DM lane keys on
// a profile and the composer's Dispatch fan-out is the event page's own audience, so neither sees
// `guestEmails`.

/** The always-first segment: the Message Attendees audience (going or maybe). */
export const ATTENDEES_SEGMENT_KEY = 'attendees'
export const TICKET_HOLDERS_SEGMENT_KEY = 'tickets'
export const CHECKED_IN_SEGMENT_KEY = 'checked-in'

/** Read caps, mirroring the CRM roster's posture (lib/events/crm-roster.ts). */
const TICKET_ROWS_CAP = 2000
const CHECKIN_ROWS_CAP = 2000

// ── PURE helpers (no IO, unit-tested in broadcast-audience.test.ts) ─────────────────────

/** The columns a ticket row may carry into `ticketSegments`. All optional and unknown-typed so
 *  the untyped admin read can be handed straight in (ADR-246). */
export type TicketAudienceRow = {
  buyer_profile_id?: unknown
  ticket_type_id?: unknown
  guest_email?: unknown
  status?: unknown
  refunded_at?: unknown
}

/** Lowercase + trim, the same normalisation reserve_ticket_atomic applies on write and the
 *  cancellation notice applies on read, so one address held two ways matches itself. */
export function normalizeGuestEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const email = raw.trim().toLowerCase()
  return email ? email : null
}

/** PURE: who a ticket row reaches. `null` for a row nobody can be told about: a deleted account
 *  (neither identity), or a ticket that is not a live purchase (a status other than 'succeeded'
 *  when the row carries one, or a refunded_at stamp). */
export function ticketIdentity(
  r: TicketAudienceRow,
): { kind: 'member'; profileId: string } | { kind: 'guest'; email: string } | null {
  if (typeof r.status === 'string' && r.status !== 'succeeded') return null
  if (r.refunded_at != null && r.refunded_at !== '') return null
  const buyer = r.buyer_profile_id
  if (typeof buyer === 'string' && buyer) return { kind: 'member', profileId: buyer }
  const email = normalizeGuestEmail(r.guest_email)
  if (email) return { kind: 'guest', email }
  return null
}

/** PURE: raw succeeded-ticket rows -> the ticket segments. Always emits the all-holders
 *  segment when anyone holds a ticket; adds one `tier:<id>` segment per named tier ONLY
 *  when two or more tiers actually have holders (otherwise the tier chip is noise).
 *  Members land in `profileIds` and guests in `guestEmails` (see the header); a row with
 *  neither identity, or one that is not a live purchase, is dropped. Both lists are deduped
 *  within each segment. */
export function ticketSegments(
  tiers: readonly { id: string; name: string }[],
  rows: readonly TicketAudienceRow[] | null | undefined,
): BroadcastSegment[] {
  const all = new Set<string>()
  const allGuests = new Set<string>()
  const byTier = new Map<string, Set<string>>()
  const guestsByTier = new Map<string, Set<string>>()
  for (const r of rows ?? []) {
    const who = ticketIdentity(r)
    if (!who) continue
    const tierId = typeof r.ticket_type_id === 'string' && r.ticket_type_id ? r.ticket_type_id : null
    if (who.kind === 'member') {
      all.add(who.profileId)
      if (tierId) {
        const set = byTier.get(tierId) ?? new Set<string>()
        set.add(who.profileId)
        byTier.set(tierId, set)
      }
    } else {
      allGuests.add(who.email)
      if (tierId) {
        const set = guestsByTier.get(tierId) ?? new Set<string>()
        set.add(who.email)
        guestsByTier.set(tierId, set)
      }
    }
  }
  if (all.size === 0 && allGuests.size === 0) return []

  const segments: BroadcastSegment[] = [
    { key: TICKET_HOLDERS_SEGMENT_KEY, label: 'Ticket holders', profileIds: [...all], guestEmails: [...allGuests] },
  ]
  const holdersIn = (tierId: string) => (byTier.get(tierId)?.size ?? 0) + (guestsByTier.get(tierId)?.size ?? 0)
  const namedTiersWithHolders = tiers.filter((t) => holdersIn(t.id) > 0)
  if (namedTiersWithHolders.length >= 2) {
    for (const t of namedTiersWithHolders) {
      segments.push({
        key: `tier:${t.id}`,
        label: t.name,
        profileIds: [...(byTier.get(t.id) ?? [])],
        guestEmails: [...(guestsByTier.get(t.id) ?? [])],
      })
    }
  }
  return segments
}

/** PURE: union the selected segments' member ids, deduped, preserving segment order.
 *  Unknown keys are ignored; no selected keys yields []. */
export function unionSegmentIds(
  segments: readonly BroadcastSegment[],
  selectedKeys: readonly string[],
): string[] {
  const wanted = new Set(selectedKeys)
  const out = new Set<string>()
  for (const s of segments) {
    if (!wanted.has(s.key)) continue
    for (const id of s.profileIds) out.add(id)
  }
  return [...out]
}

/** PURE: the guest half of `unionSegmentIds`: the selected segments' guest addresses, normalised
 *  and deduped, preserving segment order. A segment with no `guestEmails` contributes nothing. */
export function unionSegmentGuestEmails(
  segments: readonly BroadcastSegment[],
  selectedKeys: readonly string[],
): string[] {
  const wanted = new Set(selectedKeys)
  const out = new Set<string>()
  for (const s of segments) {
    if (!wanted.has(s.key)) continue
    for (const raw of s.guestEmails ?? []) {
      const email = normalizeGuestEmail(raw)
      if (email) out.add(email)
    }
  }
  return [...out]
}

/** PURE: the per-address dedupe at send time. A guest address that a MEMBER in the same audience
 *  also uses (they bought as a guest, then joined under the same address without claiming, or a
 *  member and a guest simply share a mailbox) is reached once, through the member's own lane and
 *  gate, never twice. Case-insensitive on both sides. */
export function guestEmailsNotHeldByMembers(
  guestEmails: readonly string[],
  memberEmails: readonly (string | null | undefined)[],
): string[] {
  const held = new Set<string>()
  for (const raw of memberEmails) {
    const email = normalizeGuestEmail(raw)
    if (email) held.add(email)
  }
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of guestEmails) {
    const email = normalizeGuestEmail(raw)
    if (!email || held.has(email) || seen.has(email)) continue
    seen.add(email)
    out.push(email)
  }
  return out
}

// ── IO: the segment loader + the send-time resolver ─────────────────────────────────────

/** Untyped admin handle for the reads below (loose row narrowing, ADR-246). */
function db(): { from: (t: string) => any } { // eslint-disable-line @typescript-eslint/no-explicit-any
  return createAdminClient() as never
}

async function readTicketSegments(eventId: string): Promise<BroadcastSegment[]> {
  try {
    const [ticketsRes, tiersRes] = await Promise.all([
      // guest_email beside the buyer (LIVE-320): a null buyer with an address is a guest, not a
      // deleted account. status + refunded_at are read so the pure half can refuse a refund on its
      // own, even though the filter below already keeps this read to live purchases.
      db()
        .from('event_tickets')
        .select('buyer_profile_id, ticket_type_id, guest_email, status, refunded_at')
        .eq('event_id', eventId)
        .eq('status', 'succeeded')
        .limit(TICKET_ROWS_CAP),
      db().from('event_ticket_types').select('id, name').eq('event_id', eventId),
    ])
    const tiers = ((tiersRes?.data ?? []) as { id: string; name: string | null }[]).map((t) => ({
      id: t.id,
      name: t.name || 'Unnamed tier',
    }))
    return ticketSegments(tiers, ticketsRes?.data ?? [])
  } catch {
    return []
  }
}

async function readCheckedInIds(eventId: string): Promise<string[]> {
  try {
    // The exact verified check-in query loadEventCoreStats runs (lib/events/event-stats.ts).
    const { data } = await db()
      .from('engagement_events')
      .select('actor_profile_id')
      .eq('event_type', 'practice.verified')
      .like('idempotency_key', `event_checkin:${eventId}:%`)
      .limit(CHECKIN_ROWS_CAP)
    const ids = new Set<string>()
    for (const r of (data ?? []) as { actor_profile_id: string | null }[]) {
      if (r.actor_profile_id) ids.add(r.actor_profile_id)
    }
    return [...ids]
  } catch {
    return []
  }
}

/**
 * The composer's segment list for one event: attendees always first (even when empty, so
 * the summary line can say so honestly), then ticket segments when anyone holds a ticket,
 * then checked-in when anyone has checked in. Caller gates event-manage first.
 */
export async function loadEventBroadcastSegments(eventId: string): Promise<BroadcastSegment[]> {
  const [attendeeIds, tickets, checkedIn] = await Promise.all([
    listEventCrmMemberIds(eventId),
    readTicketSegments(eventId),
    readCheckedInIds(eventId),
  ])

  const segments: BroadcastSegment[] = [
    { key: ATTENDEES_SEGMENT_KEY, label: 'Everyone going or maybe', profileIds: [...attendeeIds] },
    ...tickets,
  ]
  if (checkedIn.length > 0) {
    segments.push({ key: CHECKED_IN_SEGMENT_KEY, label: 'Checked in', profileIds: checkedIn })
  }
  return segments
}

/** Everyone a broadcast can reach: members by profile id, and guest ticket holders by the address
 *  on their ticket (LIVE-320). The two lists are disjoint by construction (a claimed ticket is a
 *  member row); the per-address overlap between a member's account email and a guest address is
 *  the caller's to resolve with `guestEmailsNotHeldByMembers` once member emails are known. */
export interface EventBroadcastReach {
  profileIds: string[]
  guestEmails: string[]
}

/**
 * SEND-TIME RESOLUTION: re-load the segments and union the selected keys server-side, so
 * the action never trusts a client-supplied id list. Unknown keys resolve to nothing;
 * no keys defaults to the attendees segment. FAIL-SAFE to an empty reach.
 */
export async function resolveEventBroadcastReach(
  eventId: string,
  selectedKeys: readonly string[],
): Promise<EventBroadcastReach> {
  const keys = selectedKeys.length > 0 ? selectedKeys : [ATTENDEES_SEGMENT_KEY]
  const segments = await loadEventBroadcastSegments(eventId)
  return {
    profileIds: unionSegmentIds(segments, keys),
    guestEmails: unionSegmentGuestEmails(segments, keys),
  }
}

/** The member half of `resolveEventBroadcastReach`, kept for callers that key on a profile. */
export async function resolveEventBroadcastAudience(
  eventId: string,
  selectedKeys: readonly string[],
): Promise<string[]> {
  return (await resolveEventBroadcastReach(eventId, selectedKeys)).profileIds
}
