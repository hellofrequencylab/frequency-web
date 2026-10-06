import { describe, it, expect, beforeEach, vi } from 'vitest'

// SCAN-753 (2026-10-05). approveVerification / rejectVerification gated on requireCommunityOps, a
// global host-or-above floor that knows nothing about whose completion is being released, so any
// host could approve their own held Zaps or anyone's in any circle; the three catalogue actions
// let any host reshape the global Zap catalogue. Locked here: the member never reviews their own
// completion, a host reviews only inside a circle they manage (the task's circle, or a circle the
// member is active in for a global task), staff keep global reach, and the global catalogue is
// staff-only. Every refusal happens before anything is written.

const mocks = vi.hoisted(() => ({
  caller: null as Record<string, unknown> | null,
  completion: null as Record<string, unknown> | null,
  memberships: [] as { circle_id: string }[],
  capsByCircle: {} as Record<string, string[]>,
  staffRole: null as string | null,
  capCalls: [] as string[],
  writes: [] as string[],
  verify: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getCallerProfile: async () => mocks.caller }))
vi.mock('@/lib/staff', () => ({ getStaffMember: async () => (mocks.staffRole ? { role: mocks.staffRole } : null) }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({}) }))
vi.mock('@/lib/crew/verify', () => ({ verifyCrewCompletion: mocks.verify }))
vi.mock('@/lib/core/load-capabilities', () => ({
  getCircleCapabilities: async (id: string) => { mocks.capCalls.push(id); return new Set(mocks.capsByCircle[id] ?? []) },
  getHubCapabilities: async () => new Set(),
  getNexusCapabilities: async () => new Set(),
  getEventCapabilities: async () => new Set(),
  getGlobalCapabilities: async () => new Set(),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const write = (kind: string) => {
        mocks.writes.push(`${table}.${kind}`)
        const chain: Record<string, unknown> = {}
        chain.eq = () => chain
        chain.is = async () => ({ error: null })
        chain.then = (res: (v: unknown) => void) => res({ error: null })
        return chain
      }
      return {
        insert: () => write('insert'),
        update: () => write('update'),
        delete: () => write('delete'),
        select: () => {
          const chain: Record<string, unknown> = {}
          chain.eq = () => chain
          chain.maybeSingle = async () => ({ data: table === 'crew_completions' ? mocks.completion : null, error: null })
          chain.limit = async () => ({ data: table === 'memberships' ? mocks.memberships : [], error: null })
          return chain
        },
      }
    },
  }),
}))

import { approveVerification, rejectVerification, createCrewTask, updateCrewTask, deleteCrewTask } from './actions'

const host = { id: 'host-1', community_role: 'host', webRole: 'member' }
const staff = { id: 'staff-1', community_role: 'member', webRole: 'admin' }

function fd(entries: Record<string, string>) {
  const f = new FormData()
  for (const [k, v] of Object.entries(entries)) f.set(k, v)
  return f
}

beforeEach(() => {
  mocks.caller = { ...host }
  mocks.completion = { id: 'c1', profile_id: 'member-9', task_id: 't1', task: { circle_id: null } }
  mocks.memberships = [{ circle_id: 'circle-a' }]
  mocks.capsByCircle = { 'circle-a': ['circle.assignTask'] }
  mocks.staffRole = null
  mocks.capCalls.length = 0
  mocks.writes.length = 0
  mocks.verify.mockReset().mockResolvedValue(true)
})

describe('approveVerification / rejectVerification scope (SCAN-753)', () => {
  it('refuses the member who logged the completion, even a host, before any write', async () => {
    mocks.completion = { ...mocks.completion, profile_id: 'host-1' }
    await expect(approveVerification('c1')).rejects.toThrow('You cannot verify your own completion.')
    await expect(rejectVerification('c1')).rejects.toThrow('You cannot reject your own completion.')
    expect(mocks.verify).not.toHaveBeenCalled()
    expect(mocks.writes).toHaveLength(0)
  })

  it('lets a host release or reject a global-task completion of a member in a circle they manage', async () => {
    await approveVerification('c1')
    expect(mocks.verify).toHaveBeenCalledWith('c1', 'leader', 'host-1')
    expect(mocks.capCalls).toEqual(['circle-a'])
    await rejectVerification('c1')
    expect(mocks.writes).toEqual(['crew_completions.delete'])
  })

  it('refuses a host who manages no circle the member is in', async () => {
    mocks.capsByCircle = { 'circle-a': ['circle.view'] }
    await expect(approveVerification('c1')).rejects.toThrow('Unauthorized')
    await expect(rejectVerification('c1')).rejects.toThrow('Unauthorized')
    expect(mocks.verify).not.toHaveBeenCalled()
    expect(mocks.writes).toHaveLength(0)
  })

  it('scopes a circle-task completion to that task\'s circle only', async () => {
    mocks.completion = { ...mocks.completion, task: { circle_id: 'circle-b' } }
    mocks.capsByCircle = { 'circle-a': ['circle.assignTask'] }
    await expect(approveVerification('c1')).rejects.toThrow('Unauthorized')
    expect(mocks.capCalls).toEqual(['circle-b'])
    mocks.capsByCircle['circle-b'] = ['circle.assignTask']
    await approveVerification('c1')
    expect(mocks.verify).toHaveBeenCalledTimes(1)
  })

  it('keeps global reach for platform staff and the community staff domain', async () => {
    mocks.capsByCircle = {}
    mocks.caller = { ...staff }
    await approveVerification('c1')
    expect(mocks.verify).toHaveBeenCalledTimes(1)
    mocks.caller = { id: 'ops-1', community_role: 'member', webRole: 'member' }
    mocks.staffRole = 'owner'
    await rejectVerification('c1')
    expect(mocks.writes).toEqual(['crew_completions.delete'])
  })

  it('throws when the completion is gone instead of touching anything', async () => {
    mocks.caller = { ...staff }
    mocks.completion = null
    await expect(approveVerification('nope')).rejects.toThrow('That completion is gone.')
    expect(mocks.verify).not.toHaveBeenCalled()
  })
})

describe('global crew task catalogue (SCAN-753)', () => {
  const task = fd({ name: 'Greet', task_type: 'hosting', zaps_value: '15', is_repeatable: 'true', requires_verification: 'false' })

  it('refuses a community host on create, update and delete', async () => {
    await expect(createCrewTask(task)).rejects.toThrow('Unauthorized')
    await expect(updateCrewTask('t1', task)).rejects.toThrow('Unauthorized')
    await expect(deleteCrewTask('t1')).rejects.toThrow('Unauthorized')
    expect(mocks.writes).toHaveLength(0)
  })

  it('admits platform staff', async () => {
    mocks.caller = { ...staff }
    await createCrewTask(task)
    await updateCrewTask('t1', task)
    await deleteCrewTask('t1')
    expect(mocks.writes).toEqual(['crew_tasks.insert', 'crew_tasks.update', 'crew_tasks.delete'])
  })
})
