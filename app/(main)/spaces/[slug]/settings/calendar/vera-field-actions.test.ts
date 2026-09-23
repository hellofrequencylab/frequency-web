import { describe, it, expect, beforeEach, vi } from 'vitest'
import { isError } from '@/lib/action-result'

// EDIT ANY FIELD, THE APPLY HALF (PROG-CAL11 slice 2).
//
// A `field` change is applied by reading the row first, changing ONE attribute on the product's own
// form shape, and writing through the product's own parser and action: `parsePlanInput` then
// `updateSpacePlan` for a Plan, `saveCalendarEntry` for a date. These tests pin that the CURRENT row
// is merged (a notes change carries the title, the links and the target along unchanged), that the
// write is the parser's output and not the raw value, that a links row is ADDED rather than
// replacing the list, and that a row the parser would drop is reported rather than swallowed.

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getCallerProfile: vi.fn() }))
vi.mock('@/lib/spaces/store', () => ({ getVisibleSpaceBySlug: vi.fn() }))
vi.mock('@/lib/spaces/entitlements', () => ({ getSpaceCapabilities: vi.fn() }))
vi.mock('@/lib/spaces/functions', () => ({ spaceFunctionAccess: vi.fn(() => true) }))
vi.mock('@/lib/ai/vera-calendar', () => ({ parseVeraTranscript: vi.fn(), proposeCalendarChanges: vi.fn() }))
vi.mock('@/lib/calendar/plans-store', () => ({
  createPenciledPlanRows: vi.fn(),
  getSpacePlan: vi.fn(),
  listSpacePlans: vi.fn(async () => []),
  transitionSpacePlanRows: vi.fn(),
  updateSpacePlan: vi.fn(),
}))
vi.mock('@/lib/calendar/entries-store', () => ({
  getCalendarEntryRow: vi.fn(),
  insertCalendarEntries: vi.fn(),
  listSpaceCalendarEntries: vi.fn(async () => []),
  updateCalendarEntryRow: vi.fn(),
}))
// The record every accepted batch writes (PROG-CAL11 slice 3). Mocked here so these tests reach
// no client of their own; what the record CARRIES is pinned in vera-undo-actions.test.ts.
vi.mock('@/lib/calendar/vera-log-store', () => ({
  getVeraChangeRecord: vi.fn(async () => null),
  listVeraChangeRecords: vi.fn(async () => []),
  recordVeraChanges: vi.fn(async () => ({ data: { id: 'record-1' } })),
}))
vi.mock('./entry-actions', () => ({ saveCalendarEntry: vi.fn() }))
vi.mock('./plan-actions', () => ({
  addPlanTodo: vi.fn(),
  reanchorPlanTodos: vi.fn(),
  transitionPlanStage: vi.fn(),
}))

import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { getSpacePlan, updateSpacePlan } from '@/lib/calendar/plans-store'
import { getCalendarEntryRow } from '@/lib/calendar/entries-store'
import { saveCalendarEntry } from './entry-actions'
import { applyVeraChanges } from './vera-calendar-actions'

const PLAN = '11111111-1111-4111-8111-111111111111'
const ENTRY = '33333333-3333-4333-8333-333333333333'
const PLAYBOOK = '44444444-4444-4444-8444-444444444444'
const LINK = { url: 'https://example.com/venue', label: 'Venue' }

function plan(over: Record<string, unknown> = {}) {
  return {
    id: PLAN,
    spaceId: 'space-1',
    title: 'Autumn retreat',
    stage: 'plan',
    notes: 'Keep it small.',
    links: [LINK],
    targetKind: 'event',
    playbookId: PLAYBOOK,
    ownerProfileId: null,
    createdBy: null,
    archivedAt: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...over,
  }
}

function entryRow(over: Record<string, unknown> = {}) {
  return {
    id: ENTRY,
    space_id: 'space-1',
    kind: 'pencil',
    title: 'Sound bath',
    notes: null,
    location: null,
    all_day: true,
    starts_at: '2026-10-22T00:00:00.000Z',
    ends_at: '2026-10-23T00:00:00.000Z',
    time_zone: 'America/Los_Angeles',
    status: 'tentative',
    blocks_time: false,
    visibility: 'team',
    option_group: null,
    hold_expires_at: null,
    stage: 'pencil',
    description: null,
    plan_id: PLAN,
    published_event_id: null,
    recurrence_rule: null,
    exception_dates: [],
    ...over,
  }
}

const field = (target: 'plan' | 'entry', id: string, path: string, value: unknown) => ({ kind: 'field', target, id, path, value })

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getCallerProfile).mockResolvedValue({ id: 'owner-1' } as never)
  vi.mocked(getVisibleSpaceBySlug).mockResolvedValue({ id: 'space-1' } as never)
  vi.mocked(getSpaceCapabilities).mockResolvedValue({ canEditProfile: true, role: 'owner' } as never)
  vi.mocked(getSpacePlan).mockResolvedValue(plan() as never)
  vi.mocked(updateSpacePlan).mockResolvedValue({ data: plan() } as never)
  vi.mocked(getCalendarEntryRow).mockResolvedValue(entryRow() as never)
  vi.mocked(saveCalendarEntry).mockResolvedValue({ data: undefined } as never)
})

describe('applyVeraChanges with a Plan field', () => {
  it('merges the current row, changes one attribute, and writes what parsePlanInput returns', async () => {
    const res = await applyVeraChanges('royal-temple', [field('plan', PLAN, 'notes', '  Bring the gong.  ')])
    expect(isError(res)).toBe(false)
    if (isError(res)) return
    expect(res.data.results).toEqual([{ index: 0, ok: true, message: 'Set Notes on "Autumn retreat" to "Bring the gong.".' }])
    // The parser's output: trimmed notes, the title, links, target and playbook carried from the row,
    // and no stage (the stage kind owns it, so a field write never moves it).
    expect(updateSpacePlan).toHaveBeenCalledWith('space-1', PLAN, {
      title: 'Autumn retreat',
      notes: 'Bring the gong.',
      links: [LINK],
      target_kind: 'event',
      playbook_id: PLAYBOOK,
    })
    expect(vi.mocked(updateSpacePlan).mock.calls[0][2]).not.toHaveProperty('stage')
  })

  it('sets a select by its option value and clears an optional field to null', async () => {
    await applyVeraChanges('royal-temple', [field('plan', PLAN, 'targetKind', 'journey'), field('plan', PLAN, 'notes', null)])
    expect(updateSpacePlan).toHaveBeenNthCalledWith(1, 'space-1', PLAN, expect.objectContaining({ target_kind: 'journey', notes: 'Keep it small.' }))
    expect(updateSpacePlan).toHaveBeenNthCalledWith(2, 'space-1', PLAN, expect.objectContaining({ target_kind: 'event', notes: null }))
  })

  it('adds a links row to the current list rather than replacing it', async () => {
    const res = await applyVeraChanges('royal-temple', [field('plan', PLAN, 'links', { url: 'https://example.com/run-sheet', label: 'Run sheet' })])
    if (isError(res)) throw new Error(res.error)
    expect(res.data.results[0]).toEqual({ index: 0, ok: true, message: 'Added to Links on "Autumn retreat": "https://example.com/run-sheet", "Run sheet".' })
    expect(updateSpacePlan).toHaveBeenCalledWith('space-1', PLAN, expect.objectContaining({ links: [LINK, { url: 'https://example.com/run-sheet', label: 'Run sheet' }] }))
  })

  it('reports a links row the parser would drop instead of writing nothing quietly', async () => {
    const res = await applyVeraChanges('royal-temple', [field('plan', PLAN, 'links', { label: 'Run sheet' })])
    if (isError(res)) throw new Error(res.error)
    expect(res.data.results[0]).toMatchObject({ ok: false, message: expect.stringContaining('was not kept') })
    expect(updateSpacePlan).not.toHaveBeenCalled()
  })

  it('refuses the whole list when a path is not in the manifest, naming the field', async () => {
    const res = await applyVeraChanges('royal-temple', [field('plan', PLAN, 'notes', 'fine'), field('plan', PLAN, 'stage', 'production')])
    expect(isError(res)).toBe(true)
    if (!isError(res)) return
    expect(res.error).toContain('"stage"')
    expect(updateSpacePlan).not.toHaveBeenCalled()
  })

  it('reports a Plan that is gone on its own line and keeps going', async () => {
    vi.mocked(getSpacePlan).mockResolvedValueOnce(null)
    const res = await applyVeraChanges('royal-temple', [field('plan', PLAN, 'notes', 'x'), field('plan', PLAN, 'notes', 'y')])
    if (isError(res)) throw new Error(res.error)
    expect(res.data.results.map((r) => r.ok)).toEqual([false, true])
    expect(res.data.results[0].message).toBe('That Plan no longer exists.')
  })
})

describe('applyVeraChanges with a date field', () => {
  it('turns the current row into the drawer form, changes one attribute, and saves through saveCalendarEntry', async () => {
    const res = await applyVeraChanges('royal-temple', [field('entry', ENTRY, 'location', 'The barn')])
    if (isError(res)) throw new Error(res.error)
    expect(res.data.results).toEqual([{ index: 0, ok: true, message: 'Set Location on "Sound bath" to "The barn".' }])
    expect(saveCalendarEntry).toHaveBeenCalledWith(
      'royal-temple',
      ENTRY,
      expect.objectContaining({
        kind: 'pencil',
        title: 'Sound bath',
        location: 'The barn',
        allDay: true,
        startDate: '2026-10-22',
        endDate: '2026-10-22',
        timeZone: 'America/Los_Angeles',
        stage: 'pencil',
        planId: PLAN,
        exceptionDates: [],
      }),
    )
  })

  it('sets a toggle and reports the value in words', async () => {
    const res = await applyVeraChanges('royal-temple', [field('entry', ENTRY, 'showPublicly', true)])
    if (isError(res)) throw new Error(res.error)
    expect(res.data.results[0].message).toBe('Set Shown publicly on "Sound bath" to on.')
    expect(saveCalendarEntry).toHaveBeenCalledWith('royal-temple', ENTRY, expect.objectContaining({ showPublicly: true, title: 'Sound bath' }))
  })

  it('refuses a date that already became a published event, and passes the action\'s own refusal through', async () => {
    vi.mocked(getCalendarEntryRow).mockResolvedValueOnce(entryRow({ published_event_id: '55555555-5555-4555-8555-555555555555' }) as never)
    const published = await applyVeraChanges('royal-temple', [field('entry', ENTRY, 'location', 'The barn')])
    if (isError(published)) throw new Error(published.error)
    expect(published.data.results[0]).toMatchObject({ ok: false, message: expect.stringContaining('event Studio') })
    expect(saveCalendarEntry).not.toHaveBeenCalled()

    vi.mocked(saveCalendarEntry).mockResolvedValueOnce({ error: 'Pick a start and end time.' } as never)
    const timed = await applyVeraChanges('royal-temple', [field('entry', ENTRY, 'allDay', false)])
    if (isError(timed)) throw new Error(timed.error)
    expect(timed.data.results[0]).toEqual({ index: 0, ok: false, message: 'Pick a start and end time.' })
  })
})
