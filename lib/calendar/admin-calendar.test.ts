import { beforeEach, describe, expect, it, vi } from 'vitest'

// LIVE-467, finding 2. The team calendar read `listEventsForSpace(spaceId, { limit: 200,
// includeUnpublished: true })`: ascending, capped, no lower bound. That is the OLDEST 200 events a
// Space ever ran, so once a Space passed 200 its upcoming events fell off the Admin grid, the
// List, Workflow, the console's "N upcoming events" and the Plan drawer's "Link an event" picker
// (which read the oldest 100). Both reads now go through one bounded window, newest-first inside
// it, and come back soonest first.

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
}))
vi.mock('./entries-store', () => ({ listStaffCalendarItems: async () => [] }))
vi.mock('./day-notes-store', () => ({ listDayNotes: async () => [] }))
vi.mock('./due-dates-store', () => ({ listDueDateItems: async () => [] }))
vi.mock('./plans-store', () => ({ listSpacePlans: async () => [] }))

import { listPlanLinkableEventRows, loadAdminCalendar } from './admin-calendar'
import { ADMIN_EVENT_FLOOR_MONTHS, adminEventFloorDay } from './month-window'

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

describe('the team calendar events read is bounded by date and cut from the old end', () => {
  it('loadAdminCalendar asks for events from the floor, newest first, drafts included', async () => {
    await loadAdminCalendar('space-1', { canManage: true, year: 2026, month1: 9, now: NOW })
    expect(listEventsForSpace).toHaveBeenCalledTimes(1)
    const [, opts] = listEventsForSpace.mock.calls[0]
    expect(opts).toMatchObject({ includeUnpublished: true, newestFirst: true, fromDay: adminEventFloorDay(NOW) })
    expect(opts.fromDay).toBe('2025-08-01')
    expect(ADMIN_EVENT_FLOOR_MONTHS).toBeGreaterThanOrEqual(13)
  })

  it('hands the rows back soonest first whatever order the store returned them in', async () => {
    listEventsForSpace.mockResolvedValue([row('later', '2026-12-01T19:00:00'), row('sooner', '2026-10-01T19:00:00')])
    const { ownedRows, events } = await loadAdminCalendar('space-1', { canManage: true, year: 2026, month1: 9, now: NOW })
    expect(ownedRows.map((r) => r.id)).toEqual(['sooner', 'later'])
    expect(events.map((e) => e.slug)).toEqual(['sooner', 'later'])
  })

  it('the "Link an event" picker reads the same window, so it offers the events the grid shows', async () => {
    listEventsForSpace.mockResolvedValue([row('later', '2026-12-01T19:00:00'), row('sooner', '2026-10-01T19:00:00')])
    const rows = await listPlanLinkableEventRows('space-1', NOW)
    const [, opts] = listEventsForSpace.mock.calls[0]
    expect(opts).toMatchObject({ includeUnpublished: true, newestFirst: true, fromDay: '2025-08-01' })
    expect(rows.map((r) => r.id)).toEqual(['sooner', 'later'])
  })
})
