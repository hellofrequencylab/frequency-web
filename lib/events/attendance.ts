// HOST-ATTESTED ATTENDANCE (PROG-GD4, migration 20270345004300).
//
// Until this module, "attended" had one record: the engagement-ledger row `checkInEvent` writes
// when a signed-in member checks THEMSELVES in, on the path that pays Zaps, ticks a streak and
// marks the member verified. A guest RSVP (no profile) and a guest ticket holder (no buyer) could
// never appear in a ledger keyed on actor_profile_id, and the host had no way to say "I saw this
// person" without paying someone for it. PROG-R11, the field test, is blocked on exactly that
// number: attendance with an independent record.
//
// THE MARK LIVES ON THE SEAT. A seat is the row the roster already reads: an event_rsvps row (a
// member, a guest RSVP, a free-tier guest claim) or a succeeded event_tickets row (a member or
// guest who paid on a tickets-mode event, who has no RSVP row, LIVE-317). Both tables carry the
// same two columns, `attended_at` and `attended_by`, so one type here names a column on both.
//
// 🔴 THIS WRITE TOUCHES NOTHING ELSE. No ledger row, no Zaps, no streak, no verified standing,
// no email. It is a host's observation and it pays nobody. The self check-in path
// (app/(main)/events/actions.ts checkInEvent) is untouched and keeps its own record; the roster
// shows the two marks side by side because they answer different questions.
//
// authz-delegated: caller-trusted internal helper. It takes the database handle as an argument
// and imports no client of its own; the manage action (app/(main)/events/[slug]/manage/
// attendance-actions.ts) gates the caller as host, cohost or platform staff BEFORE handing it the
// service-role client, and every write here is bound to the (event, seat) pair it was given.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'

/** Which row the seat is. */
export type SeatKind = 'rsvp' | 'ticket'

export interface SeatRef {
  kind: SeatKind
  /** The row id in the seat's table. */
  id: string
}

/** The table each seat kind lives in. Documentation and the probe read it; the write below names
 *  each table as a literal so the typed client and the schema-contract guard both see it. */
export const SEAT_TABLE = {
  rsvp: 'event_rsvps',
  ticket: 'event_tickets',
} as const

export interface SetSeatAttendedInput {
  eventId: string
  seat: SeatRef
  /** True marks the seat present; false clears a mistaken mark. */
  attended: boolean
  /** The host, cohost or staff profile doing the marking. Stored on the row, nulled on a clear. */
  byProfileId: string
  /** Now, for the stamp. Injected so a test can pin it. */
  now?: Date
}

export interface SetSeatAttendedResult {
  ok: boolean
  /** Why it did not land, when it did not. */
  error?: string
}

/** The two columns the write touches, and the only two. */
export interface AttendancePatch {
  attended_at: string | null
  attended_by: string | null
}

/** The typed client (same shape lib/events/geocode.ts takes). The action hands in the admin client. */
export type AttendanceDb = SupabaseClient<Database>

/** The patch for a mark or a clear. Pure, so the shape is testable without a client. */
export function attendancePatch(attended: boolean, byProfileId: string, now: Date = new Date()): AttendancePatch {
  return attended
    ? { attended_at: now.toISOString(), attended_by: byProfileId }
    : { attended_at: null, attended_by: null }
}

/**
 * Mark (or clear) one seat as attended. Scoped to the event AND the seat id, so a seat id from
 * another event cannot be marked here even by a caller who holds it. Idempotent: marking a marked
 * seat re-stamps it, clearing a clear seat is a no-op.
 */
export async function setSeatAttended(db: AttendanceDb, input: SetSeatAttendedInput): Promise<SetSeatAttendedResult> {
  const { eventId, seat, attended, byProfileId } = input
  if (!eventId || !seat?.id || !byProfileId) return { ok: false, error: 'missing_seat' }
  if (seat.kind !== 'rsvp' && seat.kind !== 'ticket') return { ok: false, error: 'unknown_seat_kind' }

  const patch = attendancePatch(attended, byProfileId, input.now)
  // Two literal chains rather than one over SEAT_TABLE[kind]: the typed client resolves a
  // literal table name cheaply and a union expensively (TS2589), and the schema-contract guard
  // reads a literal without following the map.
  const { error } =
    seat.kind === 'rsvp'
      ? await db.from('event_rsvps').update(patch).eq('event_id', eventId).eq('id', seat.id)
      : await db.from('event_tickets').update(patch).eq('event_id', eventId).eq('id', seat.id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

// ── READING THE RECORD BACK: HOW MANY PEOPLE CAME (PROG-CAL6) ─────────────────────────────────
// The recap Vera drafts for a Plan in production asks one number of an event: how many people
// were there. Two records answer it, and this fold is the ONE rule for combining them, so the
// recap and any later reader count the same way:
//
//   * the host's mark on a seat (`attended_at` on event_rsvps / event_tickets, written above), and
//   * the member's own verified check-in (the engagement ledger row `checkInEvent` writes, keyed
//     on (event, profile), read as a set of profile ids the same way the Manage roster reads it).
//
// One person is counted once: a member who checked in AND was marked by the host shares a
// profile id across both records, and a ticket bought by someone who also holds an RSVP row
// shares one too. A seat with no profile (a guest RSVP, a guest ticket) counts by its row id.
// Plus-ones and ticket quantity are NOT multiplied: the mark is on the seat, and the record says
// nothing about who else walked in with it.
//
// NULL MEANS NO RECORD. When nobody was marked and nobody checked in, the honest answer is not
// zero (a room can be full and the host never touch the roster) but "attendance was not
// recorded", so the fold returns null and the recap says exactly that. Pure, so the rule is
// testable without a client; the read that feeds it lives in lib/events/event-stats.ts.

export interface AttendedRsvpRow {
  id: string
  profile_id: string | null
  attended_at: string | null
}

export interface AttendedTicketRow {
  id: string
  buyer_profile_id: string | null
  attended_at: string | null
}

export interface AttendanceRecordInput {
  rsvps: readonly AttendedRsvpRow[]
  tickets: readonly AttendedTicketRow[]
  /** Profile ids with a verified self check-in for the event. */
  checkedInProfileIds: readonly string[]
}

/** People counted present by either record, once each, or null when the record is empty. */
export function attendanceCount(input: AttendanceRecordInput): number | null {
  const people = new Set<string>()
  for (const r of input.rsvps) {
    if (!r.attended_at) continue
    people.add(r.profile_id ? `p:${r.profile_id}` : `rsvp:${r.id}`)
  }
  for (const t of input.tickets) {
    if (!t.attended_at) continue
    people.add(t.buyer_profile_id ? `p:${t.buyer_profile_id}` : `ticket:${t.id}`)
  }
  for (const id of input.checkedInProfileIds) if (id) people.add(`p:${id}`)
  return people.size === 0 ? null : people.size
}

/** Fold several events' records into one number for a Plan: null only when EVERY record is empty. */
export function sumAttendance(counts: readonly (number | null)[]): number | null {
  let total: number | null = null
  for (const c of counts) {
    if (c == null) continue
    total = (total ?? 0) + c
  }
  return total
}
