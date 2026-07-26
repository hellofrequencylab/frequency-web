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

/** The always-first segment: the Message Attendees audience (going or maybe). */
export const ATTENDEES_SEGMENT_KEY = 'attendees'
export const TICKET_HOLDERS_SEGMENT_KEY = 'tickets'
export const CHECKED_IN_SEGMENT_KEY = 'checked-in'

/** Read caps, mirroring the CRM roster's posture (lib/events/crm-roster.ts). */
const TICKET_ROWS_CAP = 2000
const CHECKIN_ROWS_CAP = 2000

// ── PURE helpers (no IO, unit-tested in broadcast-audience.test.ts) ─────────────────────

/** PURE: raw succeeded-ticket rows -> the ticket segments. Always emits the all-holders
 *  segment when anyone holds a ticket; adds one `tier:<id>` segment per named tier ONLY
 *  when two or more tiers actually have holders (otherwise the tier chip is noise).
 *  Rows with a missing buyer are dropped; buyers are deduped within each segment. */
export function ticketSegments(
  tiers: readonly { id: string; name: string }[],
  rows: readonly { buyer_profile_id?: unknown; ticket_type_id?: unknown }[] | null | undefined,
): BroadcastSegment[] {
  const all = new Set<string>()
  const byTier = new Map<string, Set<string>>()
  for (const r of rows ?? []) {
    const buyer = r.buyer_profile_id
    if (typeof buyer !== 'string' || !buyer) continue
    all.add(buyer)
    const tierId = typeof r.ticket_type_id === 'string' && r.ticket_type_id ? r.ticket_type_id : null
    if (tierId) {
      const set = byTier.get(tierId) ?? new Set<string>()
      set.add(buyer)
      byTier.set(tierId, set)
    }
  }
  if (all.size === 0) return []

  const segments: BroadcastSegment[] = [
    { key: TICKET_HOLDERS_SEGMENT_KEY, label: 'Ticket holders', profileIds: [...all] },
  ]
  const namedTiersWithHolders = tiers.filter((t) => (byTier.get(t.id)?.size ?? 0) > 0)
  if (namedTiersWithHolders.length >= 2) {
    for (const t of namedTiersWithHolders) {
      segments.push({
        key: `tier:${t.id}`,
        label: t.name,
        profileIds: [...(byTier.get(t.id) ?? [])],
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

// ── IO: the segment loader + the send-time resolver ─────────────────────────────────────

/** Untyped admin handle for the reads below (loose row narrowing, ADR-246). */
function db(): { from: (t: string) => any } { // eslint-disable-line @typescript-eslint/no-explicit-any
  return createAdminClient() as never
}

async function readTicketSegments(eventId: string): Promise<BroadcastSegment[]> {
  try {
    const [ticketsRes, tiersRes] = await Promise.all([
      db()
        .from('event_tickets')
        .select('buyer_profile_id, ticket_type_id')
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

/**
 * SEND-TIME RESOLUTION: re-load the segments and union the selected keys server-side, so
 * the action never trusts a client-supplied id list. Unknown keys resolve to nothing;
 * no keys defaults to the attendees segment. FAIL-SAFE to [].
 */
export async function resolveEventBroadcastAudience(
  eventId: string,
  selectedKeys: readonly string[],
): Promise<string[]> {
  const keys = selectedKeys.length > 0 ? selectedKeys : [ATTENDEES_SEGMENT_KEY]
  const segments = await loadEventBroadcastSegments(eventId)
  return unionSegmentIds(segments, keys)
}
