import { describe, it, expect, beforeEach, vi } from 'vitest'
import { isError } from '@/lib/action-result'

// MOVE THE DATE, MOVE THE PREP LIST (PROG-CAL5, ADR-1386 P5).
//
// The joint that turns relative scheduling from a stored number into the thing an owner feels: when
// a date that belongs to a Plan is saved onto a DIFFERENT DAY, every anchored to-do on that Plan is
// re-resolved. Without this test the wiring is one careless edit from being dead again, which is
// exactly how the column came to hold offsets nothing read.

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getCallerProfile: vi.fn() }))
vi.mock('@/lib/spaces/store', () => ({ getVisibleSpaceBySlug: vi.fn() }))
vi.mock('@/lib/spaces/entitlements', () => ({ getSpaceCapabilities: vi.fn() }))
vi.mock('@/lib/spaces/functions', () => ({ spaceFunctionAccess: vi.fn(() => true) }))
vi.mock('@/lib/log', () => ({ log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))
vi.mock('@/lib/events/store', () => ({ listSpaceCalendarEvents: vi.fn(async () => []) }))
vi.mock('@/lib/calendar/due-dates-store', () => ({ listDueDateItems: vi.fn(async () => []) }))
vi.mock('@/lib/calendar/day-notes-store', () => ({
  deleteDayNote: vi.fn(),
  insertDayNote: vi.fn(),
  listDayNotes: vi.fn(async () => []),
  updateDayNote: vi.fn(),
}))
vi.mock('@/lib/calendar/entries-store', () => ({
  countOptionGroup: vi.fn(async () => 1),
  deleteCalendarEntryRow: vi.fn(),
  getCalendarEntryRow: vi.fn(),
  insertCalendarEntries: vi.fn(),
  keepPencilDateRow: vi.fn(),
  listSpaceCalendarEntries: vi.fn(async () => []),
  listStaffCalendarItems: vi.fn(async () => []),
  updateCalendarEntryRow: vi.fn(),
}))
vi.mock('./plan-actions', () => ({
  reanchorPlanTodos: vi.fn(),
  transitionPlanStage: vi.fn(),
}))

import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { log } from '@/lib/log'
import { getCalendarEntryRow, updateCalendarEntryRow } from '@/lib/calendar/entries-store'
import { reanchorPlanTodos } from './plan-actions'
import { saveCalendarEntry } from './entry-actions'

const ENTRY = '33333333-3333-4333-8333-333333333333'
const PLAN = '11111111-1111-4111-8111-111111111111'

/** The date as it stands before the owner edits it: a private entry belonging to a Plan. */
function currentRow(over: Record<string, unknown> = {}) {
  return {
    id: ENTRY,
    space_id: 'space-1',
    kind: 'private',
    title: 'Autumn retreat',
    notes: null,
    location: null,
    all_day: true,
    starts_at: '2026-10-22T00:00:00.000Z',
    ends_at: '2026-10-23T00:00:00.000Z',
    time_zone: 'UTC',
    status: 'busy',
    blocks_time: true,
    visibility: 'team',
    option_group: null,
    hold_expires_at: null,
    stage: null,
    description: null,
    plan_id: PLAN,
    ...over,
  }
}

/** What the staff form sends back. `startDate` is the only thing these tests vary. */
function formInput(startDate: string, over: Record<string, unknown> = {}) {
  return {
    kind: 'private',
    title: 'Autumn retreat',
    allDay: true,
    startDate,
    endDate: startDate,
    timeZone: 'UTC',
    blocksTime: true,
    showPublicly: false,
    planId: PLAN,
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getCallerProfile).mockResolvedValue({ id: 'owner-1' } as never)
  vi.mocked(getVisibleSpaceBySlug).mockResolvedValue({ id: 'space-1' } as never)
  vi.mocked(getSpaceCapabilities).mockResolvedValue({ canEditProfile: true, role: 'owner' } as never)
  vi.mocked(getCalendarEntryRow).mockResolvedValue(currentRow() as never)
  vi.mocked(updateCalendarEntryRow).mockResolvedValue({ data: true } as never)
  vi.mocked(reanchorPlanTodos).mockResolvedValue({ data: { moved: 0, anchorDay: null } } as never)
})

describe('saving a Plan-linked date onto a new day', () => {
  it('re-anchors that Plan to-do list', async () => {
    const res = await saveCalendarEntry('royal-temple', ENTRY, formInput('2026-10-29') as never)
    expect(isError(res)).toBe(false)
    expect(reanchorPlanTodos).toHaveBeenCalledWith('royal-temple', PLAN)
  })

  it('leaves the list alone when the day did not change', async () => {
    const res = await saveCalendarEntry('royal-temple', ENTRY, formInput('2026-10-22', { title: 'Autumn retreat, renamed' }) as never)
    expect(isError(res)).toBe(false)
    expect(reanchorPlanTodos).not.toHaveBeenCalled()
  })

  it('does nothing for a date that belongs to no Plan', async () => {
    vi.mocked(getCalendarEntryRow).mockResolvedValue(currentRow({ plan_id: null }) as never)
    await saveCalendarEntry('royal-temple', ENTRY, formInput('2026-10-29', { planId: null }) as never)
    expect(reanchorPlanTodos).not.toHaveBeenCalled()
  })

  it('never re-anchors after a write that failed', async () => {
    vi.mocked(updateCalendarEntryRow).mockResolvedValue({ error: 'The entry could not be saved.' } as never)
    expect(isError(await saveCalendarEntry('royal-temple', ENTRY, formInput('2026-10-29') as never))).toBe(true)
    expect(reanchorPlanTodos).not.toHaveBeenCalled()
  })

  // The date DID save. Telling the owner it did not would be a lie; saying nothing at all would make
  // a stuck checklist invisible, which is the failure this row exists to stop repeating.
  it('still saves the date when the re-anchor fails, and leaves a line that says so', async () => {
    vi.mocked(reanchorPlanTodos).mockResolvedValue({ error: 'Some to-dos did not move with the date.' } as never)
    const res = await saveCalendarEntry('royal-temple', ENTRY, formInput('2026-10-29') as never)
    expect(isError(res)).toBe(false)
    expect(log.error).toHaveBeenCalledWith(
      'calendar.plan.reanchor_failed',
      expect.objectContaining({ plan_id: PLAN, day_key: '2026-10-29' }),
    )
  })
})
