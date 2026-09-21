import { describe, it, expect, beforeEach, vi } from 'vitest'
import { isError } from '@/lib/action-result'

// PLAN TO-DOS, THE OWNER-FACING HALF (PROG-CAL4). Two things are pinned here.
//
// 1. A Space owner can COMPLETE a plan to-do. Before this, `addPlanTodo` was the only write an owner
//    could reach and `updateTaskStatus` had a single caller on the platform-staff CRM surface, so the
//    readiness bar (which counts open to-dos) could never reach zero for any Space.
// 2. A plan id from the browser is CHECKED against the gated Space before anything writes
//    `crm_tasks.plan_id` through the service-role client. `addPlanTodo` and `acceptVeraChecklist`
//    both skipped that check.

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getCallerProfile: vi.fn() }))
vi.mock('@/lib/spaces/store', () => ({ getVisibleSpaceBySlug: vi.fn() }))
vi.mock('@/lib/spaces/entitlements', () => ({ getSpaceCapabilities: vi.fn() }))
vi.mock('@/lib/spaces/functions', () => ({ spaceFunctionAccess: vi.fn(() => true) }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/calendar/plans-store', () => ({
  attachEntryToPlan: vi.fn(),
  createPenciledPlanRows: vi.fn(),
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
  updateTaskStatusInScope: vi.fn(),
}))

import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { getSpacePlan } from '@/lib/calendar/plans-store'
import { createTask, updateTaskStatusInScope } from '@/lib/crm/tasks'
import { acceptVeraChecklist, addPlanTodo, setPlanTodoDone } from './plan-actions'

const PLAN = '11111111-1111-4111-8111-111111111111'
const TODO = '22222222-2222-4222-8222-222222222222'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getCallerProfile).mockResolvedValue({ id: 'owner-1' } as never)
  vi.mocked(getVisibleSpaceBySlug).mockResolvedValue({ id: 'space-1' } as never)
  vi.mocked(getSpaceCapabilities).mockResolvedValue({ canEditProfile: true, role: 'owner' } as never)
  vi.mocked(getSpacePlan).mockResolvedValue({ id: PLAN, title: 'Autumn retreat' } as never)
  vi.mocked(updateTaskStatusInScope).mockResolvedValue(true)
  vi.mocked(createTask).mockResolvedValue({ id: 'task-1' })
})

describe('setPlanTodoDone', () => {
  it('completes a to-do, scoped to the gated Space and this Plan', async () => {
    const res = await setPlanTodoDone('royal-temple', PLAN, TODO, true)
    expect(isError(res)).toBe(false)
    expect(updateTaskStatusInScope).toHaveBeenCalledWith(TODO, 'done', { spaceId: 'space-1', planId: PLAN })
  })

  it('un-completes it again', async () => {
    await setPlanTodoDone('royal-temple', PLAN, TODO, false)
    expect(updateTaskStatusInScope).toHaveBeenCalledWith(TODO, 'open', { spaceId: 'space-1', planId: PLAN })
  })

  it('reports a miss instead of a false success', async () => {
    vi.mocked(updateTaskStatusInScope).mockResolvedValue(false)
    const res = await setPlanTodoDone('royal-temple', PLAN, TODO, true)
    expect(isError(res)).toBe(true)
  })

  it('refuses a caller who cannot edit the Space', async () => {
    vi.mocked(getSpaceCapabilities).mockResolvedValue({ canEditProfile: false, role: 'member' } as never)
    const res = await setPlanTodoDone('royal-temple', PLAN, TODO, true)
    expect(isError(res)).toBe(true)
    expect(updateTaskStatusInScope).not.toHaveBeenCalled()
  })

  it('refuses a Plan that is not this Space, and a to-do id that is not a uuid', async () => {
    vi.mocked(getSpacePlan).mockResolvedValue(null)
    expect(isError(await setPlanTodoDone('royal-temple', PLAN, TODO, true))).toBe(true)
    vi.mocked(getSpacePlan).mockResolvedValue({ id: PLAN } as never)
    expect(isError(await setPlanTodoDone('royal-temple', PLAN, 'not-a-uuid', true))).toBe(true)
    expect(updateTaskStatusInScope).not.toHaveBeenCalled()
  })
})

describe('plan writes check the Plan belongs to the gated Space', () => {
  it('addPlanTodo writes nothing for a Plan of another Space', async () => {
    vi.mocked(getSpacePlan).mockResolvedValue(null)
    const res = await addPlanTodo('royal-temple', PLAN, 'Book the sound engineer')
    expect(isError(res)).toBe(true)
    expect(createTask).not.toHaveBeenCalled()
  })

  it('addPlanTodo still works for a Plan of this Space', async () => {
    const res = await addPlanTodo('royal-temple', PLAN, 'Book the sound engineer')
    expect(isError(res)).toBe(false)
    expect(createTask).toHaveBeenCalledWith(
      expect.objectContaining({ planId: PLAN, title: 'Book the sound engineer' }),
      'space-1',
    )
  })

  it('acceptVeraChecklist writes nothing for a Plan of another Space', async () => {
    vi.mocked(getSpacePlan).mockResolvedValue(null)
    const res = await acceptVeraChecklist('royal-temple', PLAN, ['Confirm the venue'])
    expect(isError(res)).toBe(true)
    expect(createTask).not.toHaveBeenCalled()
  })

  it('acceptVeraChecklist still adds the accepted titles for this Space', async () => {
    const res = await acceptVeraChecklist('royal-temple', PLAN, ['Confirm the venue'])
    expect(isError(res)).toBe(false)
    expect(createTask).toHaveBeenCalledWith(expect.objectContaining({ planId: PLAN }), 'space-1')
  })
})
