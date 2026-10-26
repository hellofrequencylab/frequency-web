import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
vi.mock('react', () => ({ cache: <T>(fn: T) => fn }))
vi.mock('@/lib/commerce/orders', () => ({ spaceEarningsWindows: vi.fn() }))
type Event = { id: string; space_id: string; starts_at: string; time_zone: string }
let events: Event[] = []
let checkins: { actor_profile_id: string; created_at: string; event_id: string }[] = []
let forceFullPages = false
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from(table: string) {
  let selectedSpace = '', latest = '', since = '', ids: string[] = [], range: [number, number] = [0, 999]
  const chain = {
    select: () => chain,
    eq: (key: string, value: string) => { if (key === 'space_id') selectedSpace = value; return chain },
    lte: (_key: string, value: string) => { latest = value; return chain },
    gte: (_key: string, value: string) => { since = value; return chain },
    in: (_key: string, value: string[]) => { ids = value; return chain },
    order: () => chain,
    range: (from: number, to: number) => { range = [from, to]; return chain },
    then: (resolve: (reply: { data: unknown[]; error: null }) => unknown) => {
      const all = table === 'events' ? events.filter((e) => e.space_id === selectedSpace && e.starts_at <= latest && (!since || e.starts_at >= since)).sort((a, b) => b.starts_at.localeCompare(a.starts_at) || a.id.localeCompare(b.id)) : forceFullPages ? Array.from({ length: 1000 }, () => ({ actor_profile_id: '', created_at: '', event_id: '' })) : checkins.filter((r) => ids.includes(r.event_id))
      const data = table !== 'events' && forceFullPages ? all : all.slice(range[0], range[1] + 1)
      return Promise.resolve(resolve({ data, error: null }))
    },
  }
  return chain
} }) }))
import { loadSpaceCheckins } from './space-reads'
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-25T12:00:00.000Z')); events = []; checkins = []; forceFullPages = false })
afterEach(() => vi.useRealTimers())

describe('complete current attendance evidence', () => {
  it('does not let far-future events displace the recent past event with attendance', async () => {
    events = Array.from({ length: 5000 }, (_, i) => ({ id: `future-${i}`, space_id: 'A', starts_at: '2027-01-01T10:00:00.000Z', time_zone: 'UTC' }))
    events.push({ id: 'past', space_id: 'A', starts_at: '2026-10-24T10:00:00.000Z', time_zone: 'UTC' })
    checkins = [{ actor_profile_id: 'member', created_at: '2026-10-24T10:30:00.000Z', event_id: 'past' }]
    expect(await loadSpaceCheckins('A')).toHaveLength(1)
  })
  it('resolves stored wall-clock times before excluding future events', async () => {
    events = [
      { id: 'tokyo', space_id: 'A', starts_at: '2026-10-25T20:00:00.000Z', time_zone: 'Asia/Tokyo' },
      { id: 'la', space_id: 'A', starts_at: '2026-10-25T10:00:00.000Z', time_zone: 'America/Los_Angeles' },
    ]
    checkins = events.map((e) => ({ actor_profile_id: 'member', created_at: '2026-10-25T11:30:00.000Z', event_id: e.id }))
    expect((await loadSpaceCheckins('A'))?.map((r) => r.eventId)).toEqual(['tokyo'])
  })
  it('marks an over-limit past calendar unknown rather than publishing a partial zero', async () => {
    events = Array.from({ length: 5001 }, (_, i) => ({ id: `past-${i}`, space_id: 'A', starts_at: '2026-10-24T10:00:00.000Z', time_zone: 'UTC' }))
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await loadSpaceCheckins('A')).toBeNull()
    errors.mockRestore()
  })
  it('bounds scanned rows even when invalid rows never add an attendee', async () => {
    events = [{ id: 'past', space_id: 'A', starts_at: '2026-10-24T10:00:00.000Z', time_zone: 'UTC' }]
    forceFullPages = true
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await loadSpaceCheckins('A')).toBeNull()
    errors.mockRestore()
  })
})
