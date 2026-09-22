import { describe, it, expect } from 'vitest'
import {
  setSeatAttended,
  attendancePatch,
  attendanceCount,
  sumAttendance,
  SEAT_TABLE,
  type AttendanceDb,
  type AttendancePatch,
} from './attendance'

// HOST-ATTESTED ATTENDANCE (PROG-GD4). The write is the host's observation on the seat row and
// nothing else. These tests pin the three things that make it independent of the check-in ledger:
// it writes the two columns on the seat's own table, it is scoped to the event AND the seat, and
// the client it is handed is asked for NO other table (no engagement_events, no rpc) on any path.

interface Call {
  table: string
  patch: AttendancePatch
  filters: [string, string][]
}

function fakeDb(opts: { error?: string } = {}) {
  const calls: Call[] = []
  const tables: string[] = []
  const db = {
    from(table: string) {
      tables.push(table)
      return {
        update(patch: AttendancePatch) {
          const call: Call = { table, patch, filters: [] }
          calls.push(call)
          const chain = {
            eq(col: string, val: string) {
              call.filters.push([col, val])
              return chain
            },
            then(resolve: (v: { error: { message: string } | null }) => unknown) {
              return Promise.resolve(resolve({ error: opts.error ? { message: opts.error } : null }))
            },
          }
          return chain
        },
      }
    },
  }
  return { db: db as unknown as AttendanceDb, calls, tables }
}

const NOW = new Date('2026-09-14T20:00:00Z')

describe('setSeatAttended writes the seat row and only the seat row', () => {
  it('marks a guest RSVP seat on event_rsvps with attended_at + attended_by, scoped to the event', async () => {
    const { db, calls, tables } = fakeDb()
    const res = await setSeatAttended(db, {
      eventId: 'event-1',
      seat: { kind: 'rsvp', id: 'rsvp-guest' },
      attended: true,
      byProfileId: 'host-1',
      now: NOW,
    })
    expect(res).toEqual({ ok: true })
    expect(calls).toHaveLength(1)
    expect(calls[0].table).toBe('event_rsvps')
    expect(calls[0].patch).toEqual({ attended_at: NOW.toISOString(), attended_by: 'host-1' })
    expect(calls[0].filters).toEqual([
      ['event_id', 'event-1'],
      ['id', 'rsvp-guest'],
    ])
    // 🔴 THE POINT: no ledger, no reward. The only table asked for is the seat's own.
    expect(tables).toEqual(['event_rsvps'])
  })

  it('marks a guest ticket holder on event_tickets the same way', async () => {
    const { db, calls, tables } = fakeDb()
    const res = await setSeatAttended(db, {
      eventId: 'event-1',
      seat: { kind: 'ticket', id: 'ticket-guest' },
      attended: true,
      byProfileId: 'host-1',
      now: NOW,
    })
    expect(res.ok).toBe(true)
    expect(calls[0].table).toBe('event_tickets')
    expect(calls[0].patch.attended_at).toBe(NOW.toISOString())
    expect(calls[0].filters).toEqual([
      ['event_id', 'event-1'],
      ['id', 'ticket-guest'],
    ])
    expect(tables).toEqual(['event_tickets'])
  })

  it('clears a mark by nulling both columns', async () => {
    const { db, calls } = fakeDb()
    await setSeatAttended(db, { eventId: 'e', seat: { kind: 'rsvp', id: 'r' }, attended: false, byProfileId: 'host-1' })
    expect(calls[0].patch).toEqual({ attended_at: null, attended_by: null })
  })

  it('refuses a missing seat, a missing marker or an unknown kind without touching the client', async () => {
    const { db, tables } = fakeDb()
    expect((await setSeatAttended(db, { eventId: '', seat: { kind: 'rsvp', id: 'r' }, attended: true, byProfileId: 'h' })).ok).toBe(false)
    expect((await setSeatAttended(db, { eventId: 'e', seat: { kind: 'rsvp', id: '' }, attended: true, byProfileId: 'h' })).ok).toBe(false)
    expect((await setSeatAttended(db, { eventId: 'e', seat: { kind: 'rsvp', id: 'r' }, attended: true, byProfileId: '' })).ok).toBe(false)
    expect(
      (await setSeatAttended(db, { eventId: 'e', seat: { kind: 'seatbelt' as 'rsvp', id: 'r' }, attended: true, byProfileId: 'h' })).ok,
    ).toBe(false)
    expect(tables).toEqual([])
  })

  it('reports a refused write instead of swallowing it', async () => {
    const { db } = fakeDb({ error: 'PGRST204' })
    const res = await setSeatAttended(db, { eventId: 'e', seat: { kind: 'rsvp', id: 'r' }, attended: true, byProfileId: 'h' })
    expect(res).toEqual({ ok: false, error: 'PGRST204' })
  })
})

describe('the shape', () => {
  it('names one table per seat kind, and both are the seat tables the roster reads', () => {
    expect(SEAT_TABLE).toEqual({ rsvp: 'event_rsvps', ticket: 'event_tickets' })
  })

  it('attendancePatch touches exactly the two attested columns', () => {
    expect(Object.keys(attendancePatch(true, 'h', NOW)).sort()).toEqual(['attended_at', 'attended_by'])
    expect(Object.keys(attendancePatch(false, 'h')).sort()).toEqual(['attended_at', 'attended_by'])
  })
})

// READING THE RECORD BACK (PROG-CAL6): the one rule the Plan recap counts by.
describe('attendanceCount', () => {
  const at = '2026-09-20T20:00:00.000Z'

  it('is null when nobody was marked and nobody checked in: no record, not zero', () => {
    expect(
      attendanceCount({
        rsvps: [{ id: 'r1', profile_id: 'p1', attended_at: null }],
        tickets: [{ id: 't1', buyer_profile_id: null, attended_at: null }],
        checkedInProfileIds: [],
      }),
    ).toBeNull()
    expect(attendanceCount({ rsvps: [], tickets: [], checkedInProfileIds: [] })).toBeNull()
  })

  it('counts a marked seat, a guest seat and a self check-in, each once', () => {
    expect(
      attendanceCount({
        rsvps: [
          { id: 'r1', profile_id: 'p1', attended_at: at },
          { id: 'r2', profile_id: null, attended_at: at },
          { id: 'r3', profile_id: 'p3', attended_at: null },
        ],
        tickets: [{ id: 't1', buyer_profile_id: null, attended_at: at }],
        checkedInProfileIds: ['p4'],
      }),
    ).toBe(4)
  })

  it('a member on both records, or on an RSVP and a ticket, is one person', () => {
    expect(
      attendanceCount({
        rsvps: [{ id: 'r1', profile_id: 'p1', attended_at: at }],
        tickets: [{ id: 't1', buyer_profile_id: 'p1', attended_at: at }],
        checkedInProfileIds: ['p1', 'p1'],
      }),
    ).toBe(1)
  })

  it('sums across a Plan with several events and stays null only when every record is empty', () => {
    expect(sumAttendance([null, null])).toBeNull()
    expect(sumAttendance([null, 3, 2])).toBe(5)
    expect(sumAttendance([0, null])).toBe(0)
  })
})
