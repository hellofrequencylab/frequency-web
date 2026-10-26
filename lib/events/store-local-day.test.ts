import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ tables: {} as Record<string, Record<string, unknown>[]>, calls: [] as { table: string; column: string; value: unknown }[], failZone: false }))
vi.mock('@/lib/spaces/store', () => ({ loadRootSpaceId: async () => 'aaaaaaaa-0000-4000-a000-000000000001' }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from(table: string) {
  let rows = [...(state.tables[table] ?? [])]
  let error: unknown = null
  const query = {
    select(columns: string) { state.calls.push({ table, column: 'select', value: columns }); if (table === 'spaces' && columns === 'time_zone' && state.failZone) error = Error('metadata unavailable'); return query },
    eq(column: string, value: unknown) { rows = rows.filter(row => row[column] === value); return query },
    is(column: string, value: unknown) { rows = rows.filter(row => (row[column] ?? null) === value); return query },
    in(column: string, values: unknown[]) { rows = rows.filter(row => values.includes(row[column])); return query },
    gte(column: string, value: string) { state.calls.push({ table, column, value }); rows = rows.filter(row => Date.parse(String(row[column])) >= Date.parse(value)); return query },
    lt(column: string, value: string) { rows = rows.filter(row => Date.parse(String(row[column])) < Date.parse(value)); return query },
    or(filter: string) { rows = rows.filter(row => {
      const host = /host_space_id\.eq\.([^,]+)/.exec(filter)?.[1]
      const ids = /id\.in\.\(([^)]+)\)/.exec(filter)?.[1].split(',') ?? []
      return (!!host && row.host_space_id === host) || ids.includes(String(row.id))
    }); return query },
    order(column: string) { rows.sort((a, b) => String(a[column]).localeCompare(String(b[column]))); return query },
    limit(limit: number) { rows = rows.slice(0, limit); return query },
    range(from: number, to: number) { rows = rows.slice(from, to + 1); return query },
    maybeSingle: async () => ({ data: rows[0] ?? null, error }),
    then(resolve: (result: unknown) => unknown) { return Promise.resolve({ data: rows, error }).then(resolve) },
  }
  return query
} }) }))
import { listSpaceCalendarEvents, spaceHasPublicUpcomingEvents } from './store'
const A = 'aaaaaaaa-0000-4000-a000-000000000001'
const B = 'bbbbbbbb-0000-4000-a000-000000000002'
const event = (id: string, starts_at: string, patch: Record<string, unknown> = {}) => ({ id, slug: id, title: id, starts_at, time_zone: 'America/Los_Angeles', space_id: A, host_space_id: null, status: 'published', visibility: 'public', is_cancelled: false, removed_at: null, is_demo: false, ...patch })
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-08-21T02:00:00Z'))
  state.calls = []; state.failZone = false
  state.tables = { spaces: [{ id: A, time_zone: 'America/Los_Angeles', visibility: 'network', status: 'active' }, { id: B, time_zone: 'Asia/Tokyo', visibility: 'network', status: 'active' }], events: [event('tonight', '2026-08-20T19:00:00Z')], event_space_shares: [] }
})
afterEach(() => vi.useRealTimers())
it('both actual readers retain Pacific evening after UTC midnight and include already-started events today', async () => {
  expect((await listSpaceCalendarEvents(A)).map(row => row.id)).toEqual(['tonight'])
  expect(await spaceHasPublicUpcomingEvents(A)).toBe(true)
  expect(state.calls.filter(call => call.column === 'starts_at').every(call => String(call.value).startsWith('2026-08-20T00:00:00'))).toBe(true)
  vi.setSystemTime(new Date('2026-08-21T06:59:59Z'))
  expect(await spaceHasPublicUpcomingEvents(A)).toBe(true)
  vi.setSystemTime(new Date('2026-08-21T07:00:00Z'))
  expect(await listSpaceCalendarEvents(A)).toEqual([])
  expect(await spaceHasPublicUpcomingEvents(A)).toBe(false)
})
it('uses the owning Space zone instead of HOME or the machine UTC day', async () => {
  vi.setSystemTime(new Date('2026-08-20T15:30:00Z')) // Tokyo Aug21 00:30, Pacific Aug20 08:30
  state.tables.events = [event('yesterday-tokyo', '2026-08-20T19:00:00Z', { space_id: B, time_zone: 'Asia/Tokyo' })]
  expect(await listSpaceCalendarEvents(B)).toEqual([])
  expect(await spaceHasPublicUpcomingEvents(B)).toBe(false)
  state.tables.events.push(event('today-tokyo', '2026-08-21T00:15:00Z', { space_id: B, time_zone: 'Asia/Tokyo' }))
  expect((await listSpaceCalendarEvents(B)).map(row => row.id)).toEqual(['today-tokyo'])
  expect(await spaceHasPublicUpcomingEvents(B)).toBe(true)
})
it.each([null, 'Not/AZone', 'Factory'])('falls back to HOME for unknown or invalid zone %s', async zone => {
  state.tables.spaces[0].time_zone = zone
  expect((await listSpaceCalendarEvents(A)).map(row => row.id)).toEqual(['tonight'])
  expect(await spaceHasPublicUpcomingEvents(A)).toBe(true)
})
it('known caller metadata avoids an extra Space read and wins over database metadata', async () => {
  expect(await listSpaceCalendarEvents(A, { timeZone: 'Asia/Tokyo' })).toEqual([])
  expect(await spaceHasPublicUpcomingEvents(A, 'Asia/Tokyo')).toBe(false)
  expect(state.calls.some(call => call.table === 'spaces')).toBe(false)
})
it('keeps explicit historical windows, exclusive end, exhaustive bounds and limits unchanged', async () => {
  state.failZone = true // Explicit windows must not depend on a current timezone lookup.
  state.tables.events = [event('one', '2020-01-01T19:00:00Z'), event('two', '2020-01-02T19:00:00Z'), event('end', '2020-02-01T00:00:00Z')]
  expect((await listSpaceCalendarEvents(A, { fromDay: '2020-01-01', limit: 1 })).map(row => row.id)).toEqual(['one'])
  expect((await listSpaceCalendarEvents(A, { fromDay: '2020-01-01', toDay: '2020-02-01', exhaustive: true })).map(row => row.id)).toEqual(['one', 'two'])
  expect(state.calls.some(call => call.table === 'spaces')).toBe(false)
  await expect(listSpaceCalendarEvents(A, { fromDay: '2020-01-01', exhaustive: true })).rejects.toThrow('Invalid calendar window')
})
it('retains event gates, accepted shares, away-home walling and cancelled paint behavior', async () => {
  const home = 'cccccccc-0000-4000-a000-000000000003'
  const walled = 'dddddddd-0000-4000-a000-000000000004'
  state.tables.spaces.push({ id: home, visibility: 'network', status: 'active' }, { id: walled, visibility: 'private', status: 'active' })
  const shared = 'eeeeeeee-0000-4000-a000-000000000005'
  const hosted = 'ffffffff-0000-4000-a000-000000000006'
  state.tables.events = [event(shared, '2026-08-20T20:00:00Z', { space_id: home }), event(hosted, '2026-08-20T21:00:00Z', { space_id: home, host_space_id: A }), event('walled', '2026-08-20T22:00:00Z', { space_id: walled, host_space_id: A }), ...[{ visibility: 'private' }, { status: 'draft' }, { removed_at: '2026-08-20T00:00:00Z' }, { is_demo: true }, { is_cancelled: true }].map((patch, index) => event(`hidden-${index}`, '2026-08-20T19:00:00Z', patch))]
  state.tables.event_space_shares = [{ space_id: A, event_id: shared, status: 'accepted' }]
  expect((await listSpaceCalendarEvents(A)).map(row => row.id)).toEqual([shared, hosted])
  expect(await spaceHasPublicUpcomingEvents(A)).toBe(true)
  expect((await listSpaceCalendarEvents(A, { paintCancelled: true })).map(row => row.id)).toEqual(['hidden-4', shared, hosted])
  state.tables.events = state.tables.events.filter(row => row.id === 'walled' || String(row.id).startsWith('hidden-'))
  expect(await spaceHasPublicUpcomingEvents(A)).toBe(false)
})
it('fails closed when id-only metadata cannot be read', async () => {
  state.failZone = true
  expect(await listSpaceCalendarEvents(A)).toEqual([])
  expect(await spaceHasPublicUpcomingEvents(A)).toBe(false)
})
