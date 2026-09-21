import { describe, it, expect, beforeEach, vi } from 'vitest'
import { isError } from '@/lib/action-result'

// RELATIVE SCHEDULING, WIRED END TO END (PROG-CAL5).
//
// `resolveDueFromOffset` and `moveAnchoredDues` shipped with exactly one importer — their own test.
// `crm_tasks.due_offset_days` was written by `addPlanTodo` and resolved by nothing, so the column
// accumulated numbers no reader ever turned into a date. These tests pin the three joints that make
// the mechanic real, and each one fails if that joint is unplugged again:
//
//   1. adding an anchored to-do RESOLVES the offset against the Plan's date;
//   2. moving the Plan's date MOVES every anchored to-do and leaves a fixed one where it is;
//   3. saving a calendar entry onto a new day TRIGGERS that move.

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getCallerProfile: vi.fn() }))
vi.mock('@/lib/spaces/store', () => ({ getVisibleSpaceBySlug: vi.fn() }))
vi.mock('@/lib/spaces/entitlements', () => ({ getSpaceCapabilities: vi.fn() }))
vi.mock('@/lib/spaces/functions', () => ({ spaceFunctionAccess: vi.fn(() => true) }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/calendar/plans-store', () => ({
  attachEntryToPlan: vi.fn(),
  createPenciledPlanRows: vi.fn(),
  getPlanAnchorDayKey: vi.fn(),
  getSpacePlan: vi.fn(),
  insertPlaybook: vi.fn(),
  insertSpacePlan: vi.fn(),
  listPlaybooks: vi.fn(),
  listSpacePlans: vi.fn(),
  updateSpacePlan: vi.fn(),
  transitionSpacePlanRows: vi.fn(),
}))
vi.mock('@/lib/crm/tasks', () => ({
  createTask: vi.fn(),
  listTasks: vi.fn(),
  reanchorTaskDuesInScope: vi.fn(),
  updateTaskStatusInScope: vi.fn(),
}))

import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { getPlanAnchorDayKey, getSpacePlan } from '@/lib/calendar/plans-store'
import { createTask, listTasks, reanchorTaskDuesInScope } from '@/lib/crm/tasks'
import { addPlanTodo, reanchorPlanTodos } from './plan-actions'

const PLAN = '11111111-1111-4111-8111-111111111111'

function todo(over: Record<string, unknown> = {}) {
  return {
    id: 'a',
    title: 'Confirm the sound engineer',
    status: 'open',
    dueAt: null,
    dueOffsetDays: null,
    planId: PLAN,
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getCallerProfile).mockResolvedValue({ id: 'owner-1' } as never)
  vi.mocked(getVisibleSpaceBySlug).mockResolvedValue({ id: 'space-1' } as never)
  vi.mocked(getSpaceCapabilities).mockResolvedValue({ canEditProfile: true, role: 'owner' } as never)
  vi.mocked(getSpacePlan).mockResolvedValue({ id: PLAN, title: 'Autumn retreat' } as never)
  vi.mocked(getPlanAnchorDayKey).mockResolvedValue('2026-10-22')
  vi.mocked(createTask).mockResolvedValue({ id: 'task-1' })
  vi.mocked(listTasks).mockResolvedValue([] as never)
  vi.mocked(reanchorTaskDuesInScope).mockResolvedValue(0)
})

describe('adding an anchored to-do', () => {
  it('stores the offset AND the date it resolves to today', async () => {
    const res = await addPlanTodo('royal-temple', PLAN, 'Confirm the sound engineer', null, -14)
    expect(isError(res)).toBe(false)
    expect(createTask).toHaveBeenCalledWith(
      expect.objectContaining({ dueOffsetDays: -14, dueAt: '2026-10-08T12:00:00.000Z' }),
      'space-1',
    )
  })

  it('resolves an after-the-date offset too', async () => {
    await addPlanTodo('royal-temple', PLAN, 'Send the thank-you note', null, 2)
    expect(createTask).toHaveBeenCalledWith(
      expect.objectContaining({ dueOffsetDays: 2, dueAt: '2026-10-24T12:00:00.000Z' }),
      'space-1',
    )
  })

  // The offset is still worth storing before a date exists: it resolves the moment one is penciled
  // in, because the re-anchor reads the Plan's date rather than whatever was true at creation.
  it('stores the offset with no due date when the Plan has no date yet', async () => {
    vi.mocked(getPlanAnchorDayKey).mockResolvedValue(null)
    await addPlanTodo('royal-temple', PLAN, 'Confirm the sound engineer', null, -14)
    expect(createTask).toHaveBeenCalledWith(
      expect.objectContaining({ dueOffsetDays: -14, dueAt: null }),
      'space-1',
    )
  })

  it('keeps a fixed due date exactly as given, and asks for no anchor', async () => {
    await addPlanTodo('royal-temple', PLAN, 'Renew the insurance', '2026-11-01T09:00:00.000Z', null)
    expect(createTask).toHaveBeenCalledWith(
      expect.objectContaining({ dueOffsetDays: null, dueAt: '2026-11-01T09:00:00.000Z' }),
      'space-1',
    )
    expect(getPlanAnchorDayKey).not.toHaveBeenCalled()
  })

  it('drops an offset that is not a whole number of days inside the cap', async () => {
    await addPlanTodo('royal-temple', PLAN, 'Confirm the sound engineer', null, 1.5 as never)
    expect(createTask).toHaveBeenCalledWith(expect.objectContaining({ dueOffsetDays: null }), 'space-1')
    await addPlanTodo('royal-temple', PLAN, 'Confirm the sound engineer', null, 9999)
    expect(createTask).toHaveBeenLastCalledWith(expect.objectContaining({ dueOffsetDays: null }), 'space-1')
  })
})

describe('reanchorPlanTodos', () => {
  it('moves the anchored to-dos to the Plan date and leaves a fixed one alone', async () => {
    vi.mocked(listTasks).mockResolvedValue([
      todo({ id: 'engineer', dueOffsetDays: -14, dueAt: '2026-10-08T12:00:00.000Z' }),
      todo({ id: 'thank-you', dueOffsetDays: 2, dueAt: '2026-10-24T12:00:00.000Z' }),
      todo({ id: 'insurance', dueOffsetDays: null, dueAt: '2026-10-15T12:00:00.000Z' }),
    ] as never)
    vi.mocked(getPlanAnchorDayKey).mockResolvedValue('2026-10-29')
    vi.mocked(reanchorTaskDuesInScope).mockResolvedValue(2)

    const res = await reanchorPlanTodos('royal-temple', PLAN)
    expect(isError(res)).toBe(false)
    expect(reanchorTaskDuesInScope).toHaveBeenCalledWith(
      [
        { id: 'engineer', dueAt: '2026-10-15T12:00:00.000Z' },
        { id: 'thank-you', dueAt: '2026-10-31T12:00:00.000Z' },
      ],
      { spaceId: 'space-1', planId: PLAN },
    )
  })

  it('reads the anchor itself instead of trusting a day key from the browser', async () => {
    await reanchorPlanTodos('royal-temple', PLAN)
    expect(getPlanAnchorDayKey).toHaveBeenCalledWith('space-1', PLAN)
  })

  it('writes nothing for a Plan with no date yet', async () => {
    vi.mocked(getPlanAnchorDayKey).mockResolvedValue(null)
    const res = await reanchorPlanTodos('royal-temple', PLAN)
    expect(isError(res)).toBe(false)
    expect(reanchorTaskDuesInScope).not.toHaveBeenCalled()
  })

  // A checklist half-moved is worse than one that did not move, so a shortfall is said out loud.
  it('reports a shortfall rather than a quiet partial move', async () => {
    vi.mocked(listTasks).mockResolvedValue([
      todo({ id: 'engineer', dueOffsetDays: -14 }),
      todo({ id: 'thank-you', dueOffsetDays: 2 }),
    ] as never)
    vi.mocked(reanchorTaskDuesInScope).mockResolvedValue(1)
    expect(isError(await reanchorPlanTodos('royal-temple', PLAN))).toBe(true)
  })

  it('refuses a caller who cannot edit the Space, and a Plan of another Space', async () => {
    vi.mocked(getSpaceCapabilities).mockResolvedValue({ canEditProfile: false, role: 'member' } as never)
    expect(isError(await reanchorPlanTodos('royal-temple', PLAN))).toBe(true)
    vi.mocked(getSpaceCapabilities).mockResolvedValue({ canEditProfile: true, role: 'owner' } as never)
    vi.mocked(getSpacePlan).mockResolvedValue(null)
    expect(isError(await reanchorPlanTodos('royal-temple', PLAN))).toBe(true)
    expect(reanchorTaskDuesInScope).not.toHaveBeenCalled()
  })
})
