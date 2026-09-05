import { describe, it, expect, vi } from 'vitest'

// scan2 L6-14 (2026-09-05). `events.starts_at` stores the host's wall-clock as UTC parts, so a raw
// comparison against a real now() is off by the event's zone offset. The event_create meter now
// decides "still upcoming" by the event's REAL instant (eventInstant), the way the reminder crons do.

const rows: { starts_at: string; time_zone: string | null }[] = []
let readError: { message: string } | null = null
const gte = vi.fn()

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    const node: Record<string, unknown> = {}
    node.select = () => node
    node.eq = () => node
    node.is = () => node
    node.gte = (col: string, val: string) => { gte(col, val); return Promise.resolve({ data: readError ? null : rows, error: readError }) }
    return { from: () => node }
  },
}))
vi.mock('@/lib/ai/vera/usage-gate', () => ({ veraMessagesToday: vi.fn(async () => 0) }))

import { isUpcomingByInstant, memberActiveEvents, MAX_TZ_OFFSET_MS } from '@/lib/pricing/member-meter-usage'

describe('isUpcomingByInstant', () => {
  it('a Los Angeles 7 pm event is still upcoming at 1 pm local, though its raw starts_at is already past', () => {
    // 19:00 wall-clock stored as 19:00Z; the real instant is 02:00Z the next day (PDT, UTC-7).
    const row = { starts_at: '2026-09-05T19:00:00Z', time_zone: 'America/Los_Angeles' }
    const now = new Date('2026-09-05T20:00:00Z') // 13:00 in Los Angeles
    expect(new Date(row.starts_at).getTime() < now.getTime()).toBe(true) // the raw compare drops it
    expect(isUpcomingByInstant(row, now)).toBe(true)
    // And it is over once the real instant passes.
    expect(isUpcomingByInstant(row, new Date('2026-09-06T02:00:01Z'))).toBe(false)
  })

  it('a Sydney 9 am event is over at 11 am local, though its raw starts_at still reads as upcoming', () => {
    // 09:00 wall-clock stored as 09:00Z on the 6th; the real instant is 23:00Z on the 5th (AEST, UTC+10).
    const row = { starts_at: '2026-09-06T09:00:00Z', time_zone: 'Australia/Sydney' }
    const now = new Date('2026-09-06T01:00:00Z') // 11:00 in Sydney
    expect(new Date(row.starts_at).getTime() >= now.getTime()).toBe(true) // the raw compare keeps it
    expect(isUpcomingByInstant(row, now)).toBe(false)
    // And it still counts an hour before it starts.
    expect(isUpcomingByInstant(row, new Date('2026-09-05T22:00:00Z'))).toBe(true)
  })

  it('falls back to the home zone for a missing zone and rejects an unparseable row', () => {
    expect(isUpcomingByInstant({ starts_at: '2026-09-05T19:00:00Z', time_zone: null }, new Date('2026-09-05T20:00:00Z'))).toBe(true)
    expect(isUpcomingByInstant({ starts_at: 'not a date', time_zone: null }, new Date())).toBe(false)
  })
})

describe('memberActiveEvents', () => {
  it('widens the raw band by the maximum zone offset, then counts by real instant', async () => {
    const now = new Date('2026-09-05T20:00:00Z')
    rows.length = 0
    rows.push(
      { starts_at: '2026-09-05T19:00:00Z', time_zone: 'America/Los_Angeles' }, // 7 pm LA tonight: counts
      { starts_at: '2026-09-06T05:00:00Z', time_zone: 'Australia/Sydney' },     // 5 am Sydney = 19:00Z today: over
      { starts_at: '2026-09-07T10:00:00Z', time_zone: null },                   // two days out: counts
    )
    expect(await memberActiveEvents('host-1', now)).toBe(2)
    expect(gte).toHaveBeenLastCalledWith('starts_at', new Date(now.getTime() - MAX_TZ_OFFSET_MS).toISOString())
  })

  it('resolves null, never a wrong number, when the read fails', async () => {
    readError = { message: 'down' }
    expect(await memberActiveEvents('host-1')).toBeNull()
    readError = null
  })
})
