import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// APPROVAL GATES THE SEAT (SCAN-105, ADR-1148, owner ruling 2026-08-25).
//
// On an approval-gated event an unapproved answer is written as status 'going' with
// approval_status 'pending'. Counting status alone let TWENTY unapproved REQUESTS fill a
// twenty-seat event the host had not said yes to — and the host could then not approve anyone,
// because their own event read as full. It also contradicted the published promise in
// content/help/groups/events.md: "Approving says 'yes, you are welcome', not 'there is room'."
//
// These tests assert the FILTER IS SENT, not just that a number came back, because the bug was
// never in the arithmetic — it was in which rows the query asked for.
// ─────────────────────────────────────────────────────────────────────────────

interface Call { table: string; filters: [string, unknown][]; nots: [string, string, unknown][] }
const calls: Call[] = []
let countResult = 0
let waitlistRow: Record<string, unknown> | null = null
let eventRow: Record<string, unknown> | null = { capacity: 10 }

// What the promotion's compare-and-set read-back returns, per update call in order (SCAN-701):
// `undefined` means "the row as patched" (the write landed); null means zero rows (another caller
// promoted that person first).
let updateResults: (Record<string, unknown> | null | undefined)[] = []

function builder(table: string) {
  const call: Call = { table, filters: [], nots: [] }
  calls.push(call)
  const b: Record<string, unknown> = {}
  let patch: Record<string, unknown> | null = null
  Object.assign(b, {
    select: () => b,
    update: (p: Record<string, unknown>) => ((patch = p), b),
    eq: (c: string, v: unknown) => (call.filters.push([c, v]), b),
    neq: (c: string, v: unknown) => (call.nots.push(['neq', c, v]), b),
    order: () => b,
    limit: () => b,
    maybeSingle: () => {
      if (patch) {
        const scripted = updateResults.shift()
        const data = scripted === undefined ? { ...(waitlistRow ?? {}), ...patch } : scripted
        return Promise.resolve({ data, count: countResult, error: null })
      }
      return Promise.resolve({
        data: table === 'events' ? eventRow : waitlistRow,
        count: countResult,
        error: null,
      })
    },
    then: (ok: (v: unknown) => unknown) =>
      Promise.resolve({ data: null, count: countResult, error: null }).then(ok),
  })
  return b
}

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: builder }) }))

import { getCapacityInfo, promoteFromWaitlist } from './capacity'

beforeEach(() => {
  calls.length = 0
  countResult = 0
  waitlistRow = null
  eventRow = { capacity: 10 }
  updateResults = []
})

const rsvpCall = () => calls.find((c) => c.table === 'event_rsvps')

describe('getCapacityInfo — a pending request does not hold a seat', () => {
  it('excludes approval_status pending from the going count', async () => {
    countResult = 3
    const info = await getCapacityInfo('ev-1')
    expect(info.going).toBe(3)
    const c = rsvpCall()!
    expect(c.filters).toContainEqual(['status', 'going'])
    // THE ASSERTION THAT MATTERS: the pending rows are excluded IN THE QUERY.
    expect(c.nots).toContainEqual(['neq', 'approval_status', 'pending'])
  })

  it('still counts ungated RSVPs, which carry approval_status "none"', async () => {
    // approval_status is NOT NULL default 'none', so `neq pending` keeps every ungated row.
    // A null-tolerant filter would be wrong here, not merely redundant: it would suggest a state
    // the column cannot hold.
    const c = await getCapacityInfo('ev-1').then(() => rsvpCall()!)
    expect(c.nots.filter(([op]) => op === 'neq')).toHaveLength(1)
  })

  it('reports spotsLeft and isFull from the approved count', async () => {
    countResult = 10
    const info = await getCapacityInfo('ev-1')
    expect(info.isFull).toBe(true)
    expect(info.spotsLeft).toBe(0)
  })
})

describe('promoteFromWaitlist — promotion may not bypass the approval gate', () => {
  it('skips still-pending waitlist rows when picking the next seat', async () => {
    countResult = 1
    waitlistRow = { id: 'r-1', profile_id: 'p-1', guest_email: null }
    const seat = await promoteFromWaitlist('ev-1')
    expect(seat?.rsvpId).toBe('r-1')
    const waitlistQuery = calls.filter((c) => c.table === 'event_rsvps')[1]
    expect(waitlistQuery.filters).toContainEqual(['status', 'waitlist'])
    expect(waitlistQuery.nots).toContainEqual(['neq', 'approval_status', 'pending'])
  })

  it('promotes nobody when the event is already full', async () => {
    countResult = 10
    eventRow = { capacity: 10 }
    expect(await promoteFromWaitlist('ev-1')).toBeNull()
  })

  // The return contract lib/events/waitlist-notify.ts consumes (scan2 L5-02): a promoted GUEST
  // seat comes back as a seat with the guest identity set, never as null. `null` means "nobody
  // was promoted"; a seat with profileId null and guestEmail set means "a guest was", and the
  // notifier keys the email leg off exactly that.
  it('returns a guest seat with guestEmail set and profileId null, distinct from "nobody promoted"', async () => {
    countResult = 1
    waitlistRow = { id: 'r-2', profile_id: null, guest_email: 'guest@example.com' }
    const seat = await promoteFromWaitlist('ev-1')
    expect(seat).toEqual({ rsvpId: 'r-2', profileId: null, guestEmail: 'guest@example.com' })
  })

  it('returns a member seat with profileId set and guestEmail null', async () => {
    countResult = 1
    waitlistRow = { id: 'r-3', profile_id: 'p-3', guest_email: null }
    const seat = await promoteFromWaitlist('ev-1')
    expect(seat).toEqual({ rsvpId: 'r-3', profileId: 'p-3', guestEmail: null })
  })
})

// TWO WITHDRAWALS AT ONCE (SCAN-701). Both callers read the same oldest waitlist row. The write
// must land only on a row STILL waitlisted and read itself back, so the loser sees zero rows and
// moves on instead of reporting the same seat (and ringing the same person) twice.
describe('promoteFromWaitlist — two concurrent withdrawals promote two people, not one twice', () => {
  const promotion = () => calls.filter((c) => c.table === 'event_rsvps')[2]

  it('promotes only a row still on the waitlist and reads the moved row back', async () => {
    countResult = 1
    waitlistRow = { id: 'r-1', profile_id: 'p-1', guest_email: null }
    await promoteFromWaitlist('ev-1')
    expect(promotion().filters).toContainEqual(['id', 'r-1'])
    expect(promotion().filters).toContainEqual(['status', 'waitlist'])
  })

  it('moves to the next candidate when another caller took the first one, and stops when nobody is left', async () => {
    countResult = 1
    waitlistRow = { id: 'r-1', profile_id: 'p-1', guest_email: null }
    // First attempt: zero rows (someone else promoted r-1). Second: the seat lands.
    updateResults = [null, undefined]
    const seat = await promoteFromWaitlist('ev-1')
    expect(seat?.rsvpId).toBe('r-1')
    expect(calls.filter((c) => c.table === 'event_rsvps' && c.filters.some(([c2]) => c2 === 'id'))).toHaveLength(2)

    calls.length = 0
    updateResults = [null, null, null]
    expect(await promoteFromWaitlist('ev-1')).toBeNull()
  })

  it('reports nobody promoted when the capacity trigger coerced the row because the room refilled', async () => {
    countResult = 1
    waitlistRow = { id: 'r-1', profile_id: 'p-1', guest_email: null }
    updateResults = [{ id: 'r-1', status: 'waitlist' }]
    expect(await promoteFromWaitlist('ev-1')).toBeNull()
  })
})
