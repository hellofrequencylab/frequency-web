import { beforeEach, describe, expect, it, vi } from 'vitest'

// LIVE-467, finding 2. The team calendar read `listEventsForSpace(spaceId, { limit: 200,
// includeUnpublished: true })`: ascending, capped, no lower bound. That is the OLDEST 200 events a
// Space ever ran, so once a Space passed 200 its upcoming events fell off the Admin grid, the
// List, Workflow, the console's "N upcoming events" and the Plan drawer's "Link an event" picker
// (which read the oldest 100).
//
// LIVE-480, the other half. The LIVE-467 fix added a floor and read newest-first inside it, with no
// ceiling: the 200 rows kept were the FURTHEST-FUTURE ones, so a Space scheduled past the cap lost
// next month while dates two years out stayed on. Both reads now go through one window bounded at
// BOTH ends (lib/calendar/month-window.ts), filled from today outward -- the upcoming half first,
// soonest first, then the past half, most recent first, with the room that is left -- and come
// back soonest first.

const { listEventsForSpace } = vi.hoisted(() => ({
  listEventsForSpace: vi.fn(async (_spaceId: string, _opts: Record<string, unknown>) => [] as Array<Record<string, unknown>>),
}))

vi.mock('@/lib/events/store', () => ({
  listEventsForSpace,
  listSpaceCalendarEvents: async () => [],
  listCalendarEngagement: async () => new Map(),
}))
vi.mock('@/lib/time/zone', () => ({
  formatEventWhen: () => 'when',
  eventInstant: () => null,
  // The split between the two halves: today in the community's wall clock. Pinned by the test
  // clock rather than the real one.
  dayInZone: (at: Date) => at.toISOString().slice(0, 10),
  HOME_TZ: 'America/Los_Angeles',
}))
vi.mock('./entries-store', () => ({ listStaffCalendarItems: async () => [] }))
vi.mock('./day-notes-store', () => ({ listDayNotes: async () => [] }))
vi.mock('./due-dates-store', () => ({ listDueDateItems: async () => [] }))
vi.mock('./plans-store', () => ({ listSpacePlans: async () => [] }))

import { listPlanLinkableEventRows, loadAdminCalendar } from './admin-calendar'
import { ADMIN_EVENT_CEILING_MONTHS, ADMIN_EVENT_FLOOR_MONTHS, adminEventCeilingDay, adminEventFloorDay } from './month-window'

const NOW = new Date('2026-09-22T12:00:00Z')
const row = (id: string, starts_at: string) => ({
  id,
  slug: id,
  title: id,
  starts_at,
  ends_at: null,
  time_zone: 'UTC',
  location: null,
  status: 'published',
  is_cancelled: false,
  plan_id: null,
})

beforeEach(() => {
  listEventsForSpace.mockClear()
  listEventsForSpace.mockResolvedValue([])
})

/** The store answers each half from one pool of rows, by the window the half asked for. */
function storeHolding(rows: ReturnType<typeof row>[]) {
  listEventsForSpace.mockImplementation(async (_spaceId, opts) => {
    const from = typeof opts.fromDay === 'string' ? `${opts.fromDay}T00:00:00` : ''
    const to = typeof opts.toDay === 'string' ? `${opts.toDay}T00:00:00` : '9999'
    const inWindow = rows.filter((r) => r.starts_at >= from && r.starts_at < to)
    const ordered = inWindow.sort((a, b) => (a.starts_at < b.starts_at ? -1 : 1))
    if (opts.newestFirst) ordered.reverse()
    return ordered.slice(0, typeof opts.limit === 'number' ? opts.limit : 50)
  })
}

describe('the team calendar events read is bounded at both ends and filled from today outward', () => {
  it('loadAdminCalendar reads the upcoming half first, soonest first, from today to the ceiling', async () => {
    await loadAdminCalendar('space-1', { canManage: true, year: 2026, month1: 9, now: NOW })
    expect(listEventsForSpace).toHaveBeenCalledTimes(2)
    const [, upcoming] = listEventsForSpace.mock.calls[0]
    expect(upcoming).toMatchObject({ includeUnpublished: true, limit: 200, fromDay: '2026-09-22', toDay: adminEventCeilingDay(NOW) })
    expect(upcoming.toDay).toBe('2027-12-01')
    expect(upcoming.newestFirst).toBeUndefined()
    expect(ADMIN_EVENT_CEILING_MONTHS).toBeGreaterThanOrEqual(15)
  })

  it('then the past half, most recent first, from the floor to today, with the room that is left', async () => {
    await loadAdminCalendar('space-1', { canManage: true, year: 2026, month1: 9, now: NOW })
    const [, past] = listEventsForSpace.mock.calls[1]
    expect(past).toMatchObject({ includeUnpublished: true, limit: 200, newestFirst: true, fromDay: adminEventFloorDay(NOW), toDay: '2026-09-22' })
    expect(past.fromDay).toBe('2025-08-01')
    expect(ADMIN_EVENT_FLOOR_MONTHS).toBeGreaterThanOrEqual(13)
  })

  it('the past half only gets the room the upcoming half left, and is skipped when there is none', async () => {
    const upcoming = Array.from({ length: 200 }, (_, i) => row(`u${i}`, `2026-10-${String(1 + (i % 28)).padStart(2, '0')}T19:00:00`))
    storeHolding([...upcoming, row('old', '2026-01-10T19:00:00')])
    const { ownedRows } = await loadAdminCalendar('space-1', { canManage: true, year: 2026, month1: 9, now: NOW })
    expect(listEventsForSpace).toHaveBeenCalledTimes(1)
    expect(ownedRows).toHaveLength(200)
    expect(ownedRows.some((r) => r.id === 'old')).toBe(false)

    listEventsForSpace.mockClear()
    storeHolding([...upcoming.slice(0, 150), row('old', '2026-01-10T19:00:00')])
    await loadAdminCalendar('space-1', { canManage: true, year: 2026, month1: 9, now: NOW })
    expect(listEventsForSpace).toHaveBeenCalledTimes(2)
    expect(listEventsForSpace.mock.calls[1][1].limit).toBe(50)
  })

  it('🔴 a Space scheduled past the cap keeps next month and loses the far end, never the other way round', async () => {
    // 260 upcoming dates inside the window (a daily class), 20 in the past year. Before LIVE-480 the
    // newest-first read kept the 200 furthest-future rows and next month fell off every surface.
    const upcoming: ReturnType<typeof row>[] = []
    for (let i = 0; i < 260; i++) {
      const d = new Date(Date.UTC(2026, 8, 23 + i))
      upcoming.push(row(`u${i}`, `${d.toISOString().slice(0, 10)}T19:00:00`))
    }
    const past = Array.from({ length: 20 }, (_, i) => row(`p${i}`, `2026-0${1 + (i % 8)}-15T19:00:00`))
    storeHolding([...upcoming, ...past])
    const { ownedRows } = await loadAdminCalendar('space-1', { canManage: true, year: 2026, month1: 9, now: NOW })
    expect(ownedRows).toHaveLength(200)
    expect(ownedRows[0].id).toBe('u0') // tomorrow is on
    expect(ownedRows.some((r) => r.starts_at.startsWith('2026-10-'))).toBe(true) // next month is on
    expect(ownedRows.some((r) => r.id === 'u259')).toBe(false) // the far end is the cut
    expect(ownedRows.some((r) => r.id.startsWith('p'))).toBe(false) // and the past yielded its room
  })

  it('hands the rows back soonest first whatever order the two halves returned them in', async () => {
    storeHolding([row('later', '2026-12-01T19:00:00'), row('sooner', '2026-10-01T19:00:00'), row('past', '2026-06-01T19:00:00')])
    const { ownedRows, events } = await loadAdminCalendar('space-1', { canManage: true, year: 2026, month1: 9, now: NOW })
    expect(ownedRows.map((r) => r.id)).toEqual(['past', 'sooner', 'later'])
    expect(events.map((e) => e.slug)).toEqual(['past', 'sooner', 'later'])
  })

  it('the "Link an event" picker reads the same window, so it offers the events the grid shows', async () => {
    storeHolding([row('later', '2026-12-01T19:00:00'), row('sooner', '2026-10-01T19:00:00')])
    const rows = await listPlanLinkableEventRows('space-1', NOW)
    expect(listEventsForSpace).toHaveBeenCalledTimes(2)
    expect(listEventsForSpace.mock.calls[0][1]).toMatchObject({ includeUnpublished: true, fromDay: '2026-09-22', toDay: '2027-12-01' })
    expect(listEventsForSpace.mock.calls[1][1]).toMatchObject({ includeUnpublished: true, newestFirst: true, fromDay: '2025-08-01', toDay: '2026-09-22' })
    expect(rows.map((r) => r.id)).toEqual(['sooner', 'later'])
  })
})
