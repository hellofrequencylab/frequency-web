import { describe, it, expect, beforeEach, vi } from 'vitest'
import { isError } from '@/lib/action-result'

// UNDO, THE ACTION HALF (PROG-CAL11 slice 3; the record half of the 2026-09-22 owner ask).
//
// The confirmation gate shipped as LIVE-473. This is the other half: every accepted proposal is
// recorded with the BEFORE values the actions read, and a single Undo reverses the lot through
// those same actions in reverse order. These tests pin the three things that make that true:
//
//   1. The record is written from what the ACTION saw, not from what the browser sent, and it
//      carries a reverse per change built from the value the row held a moment earlier.
//   2. A change that failed is not in the record, and a batch where nothing landed writes nothing.
//   3. Undo is a PROPOSAL: `undoVeraChanges` writes nothing, hands back the reverses last first,
//      and accepting it writes its own record pointing at the batch it reversed.

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
vi.mock('@/lib/calendar/vera-log-store', () => ({
  getVeraChangeRecord: vi.fn(),
  listVeraChangeRecords: vi.fn(async () => []),
  recordVeraChanges: vi.fn(),
}))
vi.mock('./entry-actions', () => ({ saveCalendarEntry: vi.fn() }))
vi.mock('./plan-actions', () => ({
  addPlanTodo: vi.fn(),
  archiveSpacePlan: vi.fn(),
  reanchorPlanTodos: vi.fn(),
  transitionPlanStage: vi.fn(),
}))

import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { getSpacePlan, updateSpacePlan } from '@/lib/calendar/plans-store'
import { getCalendarEntryRow, updateCalendarEntryRow } from '@/lib/calendar/entries-store'
import { getVeraChangeRecord, listVeraChangeRecords, recordVeraChanges } from '@/lib/calendar/vera-log-store'
import { addPlanTodo, reanchorPlanTodos, transitionPlanStage } from './plan-actions'
import { applyVeraChanges, listVeraChangeLog, undoVeraChanges } from './vera-calendar-actions'
import type { VeraLogRecord } from '@/lib/calendar/vera-command'

const PLAN = '11111111-1111-4111-8111-111111111111'
const ENTRY = '33333333-3333-4333-8333-333333333333'
const RECORD = '55555555-5555-4555-8555-555555555555'
const ELSEWHERE = '66666666-6666-4666-8666-666666666666'

function plan(over: Record<string, unknown> = {}) {
  return {
    id: PLAN,
    spaceId: 'space-1',
    title: 'Autumn retreat',
    stage: 'production',
    notes: 'Keep it small.',
    links: [],
    files: [],
    targetKind: 'event',
    playbookId: null,
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
    location: 'The barn',
    all_day: true,
    starts_at: '2026-10-22T00:00:00.000Z',
    ends_at: '2026-10-23T00:00:00.000Z',
    time_zone: 'UTC',
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

/** The steps a record holds, as the store hands them back. */
function record(over: Partial<VeraLogRecord> = {}): VeraLogRecord {
  return {
    id: RECORD,
    at: '2026-09-23T10:00:00.000Z',
    undoOf: null,
    undoneBy: null,
    steps: [
      {
        change: { kind: 'retitle', planId: PLAN, title: 'Autumn retreat' },
        message: 'Renamed "Winter sits" to "Autumn retreat".',
        reverse: { kind: 'retitle', planId: PLAN, title: 'Winter sits' },
        reason: null,
      },
      {
        change: { kind: 'todo', planId: PLAN, title: 'Book the room', dueOffsetDays: null },
        message: 'Added the to-do "Book the room".',
        reverse: null,
        reason: 'Undo cannot remove a to-do. Open the Plan and delete it there.',
      },
      {
        change: { kind: 'move', entryId: ENTRY, toDay: '2026-10-22' },
        message: 'Moved "Sound bath" to Oct 22.',
        reverse: { kind: 'move', entryId: ENTRY, toDay: '2026-10-15' },
        reason: null,
      },
    ],
    ...over,
  }
}

const steps = () => vi.mocked(recordVeraChanges).mock.calls[0][2]

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getCallerProfile).mockResolvedValue({ id: 'owner-1' } as never)
  vi.mocked(getVisibleSpaceBySlug).mockResolvedValue({ id: 'space-1' } as never)
  vi.mocked(getSpaceCapabilities).mockResolvedValue({ canEditProfile: true, role: 'owner' } as never)
  vi.mocked(getSpacePlan).mockResolvedValue(plan() as never)
  vi.mocked(updateSpacePlan).mockResolvedValue({ data: plan() } as never)
  vi.mocked(getCalendarEntryRow).mockResolvedValue(entryRow() as never)
  vi.mocked(updateCalendarEntryRow).mockResolvedValue({ data: entryRow() } as never)
  vi.mocked(addPlanTodo).mockResolvedValue({ data: undefined } as never)
  vi.mocked(reanchorPlanTodos).mockResolvedValue({ data: undefined } as never)
  vi.mocked(transitionPlanStage).mockResolvedValue({ data: undefined } as never)
  vi.mocked(recordVeraChanges).mockResolvedValue({ data: { id: RECORD } })
  vi.mocked(getVeraChangeRecord).mockResolvedValue(null)
})

describe('the record an accepted proposal writes', () => {
  it('keeps the before values the actions read, so each line knows what puts it back', async () => {
    const res = await applyVeraChanges('royal-temple', [
      { kind: 'retitle', planId: PLAN, title: 'Winter sits' },
      { kind: 'move', entryId: ENTRY, toDay: '2026-11-04' },
      { kind: 'field', target: 'plan', id: PLAN, path: 'notes', value: 'Bring the gong.' },
      { kind: 'stage', planId: PLAN, stage: 'cancelled' },
    ], [3])
    expect(isError(res)).toBe(false)
    expect(recordVeraChanges).toHaveBeenCalledTimes(1)
    expect(vi.mocked(recordVeraChanges).mock.calls[0][0]).toBe('space-1')
    expect(vi.mocked(recordVeraChanges).mock.calls[0][1]).toBe('owner-1')
    expect(vi.mocked(recordVeraChanges).mock.calls[0][3]).toBeNull()
    expect(steps().map((s) => s.reverse)).toEqual([
      // The title the row held, not the one the change asked for.
      { kind: 'retitle', planId: PLAN, title: 'Autumn retreat' },
      // The day the row was on before it was shifted.
      { kind: 'move', entryId: ENTRY, toDay: '2026-10-22' },
      // The notes the row held before they were replaced.
      { kind: 'field', target: 'plan', id: PLAN, path: 'notes', value: 'Keep it small.' },
      // A cancel reverses to the WORKING stage the Plan was in, never to Cancelled again.
      { kind: 'stage', planId: PLAN, stage: 'production' },
    ])
    // Every step also keeps the sentence the action reported, which is what the log shows.
    expect(steps()[0].message).toBe('Renamed "Autumn retreat" to "Winter sits".')
  })

  it('records a to-do with no reverse and the reason instead, rather than leaving a hole', async () => {
    await applyVeraChanges('royal-temple', [{ kind: 'todo', planId: PLAN, title: 'Book the room' }])
    expect(steps()).toHaveLength(1)
    expect(steps()[0].reverse).toBeNull()
    expect(steps()[0].reason).toContain('Open the Plan')
  })

  it('leaves a change that failed out of the record', async () => {
    vi.mocked(updateCalendarEntryRow).mockResolvedValue({ error: 'The date could not be saved.' } as never)
    const res = await applyVeraChanges('royal-temple', [
      { kind: 'retitle', planId: PLAN, title: 'Winter sits' },
      { kind: 'move', entryId: ENTRY, toDay: '2026-11-04' },
    ])
    expect(isError(res)).toBe(false)
    if (isError(res)) return
    expect(res.data.results.map((r) => r.ok)).toEqual([true, false])
    expect(steps()).toHaveLength(1)
    expect(steps()[0].change).toMatchObject({ kind: 'retitle' })
  })

  it('writes nothing when nothing landed', async () => {
    vi.mocked(getSpacePlan).mockResolvedValue(null as never)
    const res = await applyVeraChanges('royal-temple', [{ kind: 'retitle', planId: PLAN, title: 'Winter sits' }])
    expect(isError(res)).toBe(false)
    expect(recordVeraChanges).not.toHaveBeenCalled()
  })

  it('does not fail the batch when the record cannot be written, and says so out loud', async () => {
    vi.mocked(recordVeraChanges).mockResolvedValue({ error: 'The changes landed, but they were not written to the change log, so Undo will not offer them.' })
    const res = await applyVeraChanges('royal-temple', [{ kind: 'retitle', planId: PLAN, title: 'Winter sits' }])
    expect(isError(res)).toBe(false)
    if (isError(res)) return
    expect(res.data.results[0].ok).toBe(true)
    expect(res.data.logError).toContain('Undo will not offer them')
  })
})

describe('undoVeraChanges', () => {
  it('hands back the reverses LAST FIRST as a proposal, and writes nothing', async () => {
    vi.mocked(getVeraChangeRecord).mockResolvedValue(record())
    const res = await undoVeraChanges('royal-temple', RECORD)
    expect(isError(res)).toBe(false)
    if (isError(res)) return
    expect(res.data.kind).toBe('proposal')
    if (res.data.kind !== 'proposal') return
    expect(res.data.changes).toEqual([
      { kind: 'move', entryId: ENTRY, toDay: '2026-10-15' },
      { kind: 'retitle', planId: PLAN, title: 'Winter sits' },
    ])
    expect(res.data.undoOf).toBe(RECORD)
    expect(res.data.note).toContain('2 of the 3')
    // A proposal names its rows: the context is read by id, so an archived Plan is still named.
    expect(res.data.context.plans[PLAN]).toBe('Autumn retreat')
    expect(res.data.context.entries[ENTRY]).toBe('Sound bath')
    expect(updateSpacePlan).not.toHaveBeenCalled()
    expect(updateCalendarEntryRow).not.toHaveBeenCalled()
    expect(recordVeraChanges).not.toHaveBeenCalled()
  })

  it('refuses a batch that is not in this calendar log, and an id that is not ours', async () => {
    vi.mocked(getVeraChangeRecord).mockResolvedValue(null)
    expect(await undoVeraChanges('royal-temple', RECORD)).toMatchObject({ error: expect.stringContaining('change log') })
    expect(await undoVeraChanges('royal-temple', 'batch-1')).toMatchObject({ error: expect.stringContaining('not one of ours') })
    expect(getVeraChangeRecord).toHaveBeenCalledTimes(1)
  })

  it('refuses a batch with nothing to put back rather than offering an empty proposal', async () => {
    vi.mocked(getVeraChangeRecord).mockResolvedValue(record({ steps: [record().steps[1]] }))
    expect(await undoVeraChanges('royal-temple', RECORD)).toMatchObject({ error: expect.stringContaining('put back') })
  })
})

describe('accepting an Undo', () => {
  it('records the new batch against the one it reversed, so the log reads forwards', async () => {
    vi.mocked(getVeraChangeRecord).mockResolvedValue(record())
    const res = await applyVeraChanges('royal-temple', [{ kind: 'retitle', planId: PLAN, title: 'Winter sits' }], [], RECORD)
    expect(isError(res)).toBe(false)
    expect(vi.mocked(recordVeraChanges).mock.calls[0][3]).toBe(RECORD)
  })

  it('refuses an undo that names a batch from somewhere else BEFORE it applies anything', async () => {
    vi.mocked(getVeraChangeRecord).mockResolvedValue(null)
    const res = await applyVeraChanges('royal-temple', [{ kind: 'retitle', planId: PLAN, title: 'Winter sits' }], [], ELSEWHERE)
    expect(isError(res)).toBe(true)
    expect(updateSpacePlan).not.toHaveBeenCalled()
    expect(recordVeraChanges).not.toHaveBeenCalled()
  })
})

describe('listVeraChangeLog', () => {
  it('hands the browser the sentences and the counts, and keeps the vocabulary on this side', async () => {
    vi.mocked(listVeraChangeRecords).mockResolvedValue([record({ undoneBy: ELSEWHERE })])
    const res = await listVeraChangeLog('royal-temple')
    expect(isError(res)).toBe(false)
    if (isError(res)) return
    expect(res.data.entries).toEqual([
      {
        id: RECORD,
        at: '2026-09-23T10:00:00.000Z',
        lines: [
          { message: 'Renamed "Winter sits" to "Autumn retreat".', reason: null },
          { message: 'Added the to-do "Book the room".', reason: 'Undo cannot remove a to-do. Open the Plan and delete it there.' },
          { message: 'Moved "Sound bath" to Oct 22.', reason: null },
        ],
        reversible: 2,
        undoOf: null,
        undoneBy: ELSEWHERE,
      },
    ])
  })

  it('refuses a caller who cannot edit this calendar', async () => {
    vi.mocked(getSpaceCapabilities).mockResolvedValue({ canEditProfile: false, role: 'member' } as never)
    expect(await listVeraChangeLog('royal-temple')).toMatchObject({ error: expect.stringContaining('do not have access') })
    expect(listVeraChangeRecords).not.toHaveBeenCalled()
  })
})
