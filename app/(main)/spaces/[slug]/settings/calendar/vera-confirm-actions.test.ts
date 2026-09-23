import { describe, it, expect, beforeEach, vi } from 'vitest'
import { isError } from '@/lib/action-result'

// THE SECOND GATE (owner ruling: Vera changes nothing without explicit permission).
//
// Accept used to be the whole gate, and every proposed line arrived pre-ticked, so an archive, which
// DELETES a Plan's penciled dates with no restore control anywhere in the product, sat in the same
// list as a retitle with its box already on. These tests pin the half that a browser cannot talk its
// way past: `applyVeraChanges` refuses a destructive line whose confirmation did not come back with
// it, on its own result line, and leaves every other line alone. The client's own arming is pinned
// in components/spaces/vera-calendar-box.render.test.tsx.
//
// They also pin the other half of the preview's honesty: the proposal comes back with the titles and
// the current values the SERVER read, so a line can never say "that Plan" and a field change says
// what it would overwrite.

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
import { proposeCalendarChanges } from '@/lib/ai/vera-calendar'
import { getSpacePlan, listSpacePlans, updateSpacePlan } from '@/lib/calendar/plans-store'
import { listSpaceCalendarEntries } from '@/lib/calendar/entries-store'
import { archiveSpacePlan, transitionPlanStage } from './plan-actions'
import { applyVeraChanges, veraCalendarCommand } from './vera-calendar-actions'

const PLAN = '11111111-1111-4111-8111-111111111111'
const OTHER_PLAN = '22222222-2222-4222-8222-222222222222'
const ENTRY = '33333333-3333-4333-8333-333333333333'

const LONG_NOTES = 'Bring the gong. '.repeat(200).trim()

function plan(over: Record<string, unknown> = {}) {
  return {
    id: PLAN,
    spaceId: 'space-1',
    title: 'Autumn retreat',
    stage: 'plan',
    notes: LONG_NOTES,
    links: [],
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

const archive = (planId = PLAN) => ({ kind: 'archive', planId })
const cancel = (planId = PLAN) => ({ kind: 'stage', planId, stage: 'cancelled' })
const retitle = (title: string) => ({ kind: 'retitle', planId: PLAN, title })

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getCallerProfile).mockResolvedValue({ id: 'owner-1' } as never)
  vi.mocked(getVisibleSpaceBySlug).mockResolvedValue({ id: 'space-1' } as never)
  vi.mocked(getSpaceCapabilities).mockResolvedValue({ canEditProfile: true, role: 'owner' } as never)
  vi.mocked(getSpacePlan).mockResolvedValue(plan() as never)
  vi.mocked(updateSpacePlan).mockResolvedValue({ data: plan() } as never)
  vi.mocked(archiveSpacePlan).mockResolvedValue({ data: undefined } as never)
  vi.mocked(transitionPlanStage).mockResolvedValue({ data: undefined } as never)
})

describe('a destructive change cannot be applied without its own confirmation', () => {
  it('refuses an archive that arrived with no confirmation, and archives nothing', async () => {
    const res = await applyVeraChanges('royal-temple', [archive()])
    if (isError(res)) throw new Error(res.error)
    expect(res.data.results[0]).toMatchObject({ index: 0, ok: false })
    expect(res.data.results[0].message).toContain('Nothing was archived.')
    expect(archiveSpacePlan).not.toHaveBeenCalled()
  })

  it('refuses a move to Cancelled the same way, while another stage goes through untouched', async () => {
    const refused = await applyVeraChanges('royal-temple', [cancel()])
    if (isError(refused)) throw new Error(refused.error)
    expect(refused.data.results[0]).toMatchObject({ ok: false })
    expect(refused.data.results[0].message).toContain('Nothing was cancelled.')
    expect(transitionPlanStage).not.toHaveBeenCalled()

    const allowed = await applyVeraChanges('royal-temple', [{ kind: 'stage', planId: PLAN, stage: 'production' }])
    if (isError(allowed)) throw new Error(allowed.error)
    expect(allowed.data.results[0]).toMatchObject({ ok: true })
    expect(transitionPlanStage).toHaveBeenCalledWith('royal-temple', PLAN, 'production')
  })

  it('applies the archive once its position comes back confirmed', async () => {
    const res = await applyVeraChanges('royal-temple', [archive()], [0])
    if (isError(res)) throw new Error(res.error)
    expect(res.data.results[0]).toMatchObject({ ok: true })
    expect(archiveSpacePlan).toHaveBeenCalledWith('royal-temple', PLAN)
  })

  it('confirms one line only, never the whole list', async () => {
    const res = await applyVeraChanges('royal-temple', [archive(PLAN), archive(OTHER_PLAN)], [1])
    if (isError(res)) throw new Error(res.error)
    expect(res.data.results.map((r) => r.ok)).toEqual([false, true])
    expect(archiveSpacePlan).toHaveBeenCalledTimes(1)
    expect(archiveSpacePlan).toHaveBeenCalledWith('royal-temple', OTHER_PLAN)
  })

  it('leaves the lines around it alone: a refused archive does not stop a retitle', async () => {
    const res = await applyVeraChanges('royal-temple', [archive(), retitle('Autumn retreat, 2026')])
    if (isError(res)) throw new Error(res.error)
    expect(res.data.results.map((r) => r.ok)).toEqual([false, true])
    expect(updateSpacePlan).toHaveBeenCalledWith('space-1', PLAN, { title: 'Autumn retreat, 2026' })
  })

  it('ignores a confirmation that is not a position in the list it was sent', async () => {
    for (const confirmed of [[1], [-1], ['0'], 'all', true, [0.5]]) {
      vi.mocked(archiveSpacePlan).mockClear()
      const res = await applyVeraChanges('royal-temple', [archive()], confirmed)
      if (isError(res)) throw new Error(res.error)
      expect(res.data.results[0].ok).toBe(false)
      expect(archiveSpacePlan).not.toHaveBeenCalled()
    }
  })
})

describe('the proposal comes back with what the preview needs', () => {
  beforeEach(() => {
    vi.mocked(listSpacePlans).mockResolvedValue([plan()] as never)
    vi.mocked(listSpaceCalendarEntries).mockResolvedValue([entryRow()] as never)
  })

  const ask = { ask: 'Archive the autumn retreat', mode: 'pencil', year: 2026, month1: 10, timeZone: 'UTC' }

  it('names every object the proposal touches, so no line has to read "that Plan"', async () => {
    vi.mocked(proposeCalendarChanges).mockResolvedValue({
      kind: 'proposal',
      changes: [{ kind: 'archive', planId: PLAN }, { kind: 'move', entryId: ENTRY, toDay: '2026-11-02' }],
      note: 'Two things.',
    } as never)
    const res = await veraCalendarCommand('royal-temple', ask)
    if (isError(res)) throw new Error(res.error)
    if (res.data.kind !== 'proposal') throw new Error('expected a proposal')
    expect(res.data.context.plans[PLAN]).toBe('Autumn retreat')
    expect(res.data.context.entries[ENTRY]).toBe('Sound bath')
  })

  it('carries how much a field change would overwrite, and nothing for an empty field', async () => {
    vi.mocked(proposeCalendarChanges).mockResolvedValue({
      kind: 'proposal',
      changes: [
        { kind: 'field', target: 'plan', id: PLAN, path: 'notes', value: 'Bring the small gong.' },
        { kind: 'field', target: 'entry', id: ENTRY, path: 'description', value: 'A slow hour.' },
      ],
      note: 'Two fields.',
    } as never)
    const res = await veraCalendarCommand('royal-temple', ask)
    if (isError(res)) throw new Error(res.error)
    if (res.data.kind !== 'proposal') throw new Error('expected a proposal')
    expect(res.data.context.current?.[`plan:${PLAN}:notes`]).toEqual({ chars: LONG_NOTES.length, text: null })
    // The date's description is empty, so there is nothing to warn about and the line stays short.
    expect(res.data.context.current?.[`entry:${ENTRY}:description`]).toBeUndefined()
  })

  it('leaves a clarification exactly as it came, with no context bolted on', async () => {
    vi.mocked(proposeCalendarChanges).mockResolvedValue({
      kind: 'clarification',
      question: 'Which one?',
      options: [
        { label: 'A', value: PLAN },
        { label: 'B', value: OTHER_PLAN },
      ],
      allowFreeText: false,
      transcript: [],
    } as never)
    const res = await veraCalendarCommand('royal-temple', ask)
    if (isError(res)) throw new Error(res.error)
    expect(res.data.kind).toBe('clarification')
    expect(res.data).not.toHaveProperty('context')
  })
})
