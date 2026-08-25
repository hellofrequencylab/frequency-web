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

function builder(table: string) {
  const call: Call = { table, filters: [], nots: [] }
  calls.push(call)
  const b: Record<string, unknown> = {}
  Object.assign(b, {
    select: () => b,
    update: () => b,
    eq: (c: string, v: unknown) => (call.filters.push([c, v]), b),
    neq: (c: string, v: unknown) => (call.nots.push(['neq', c, v]), b),
    order: () => b,
    limit: () => b,
    maybeSingle: () =>
      Promise.resolve({
        data: table === 'events' ? eventRow : waitlistRow,
        count: countResult,
        error: null,
      }),
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
})
