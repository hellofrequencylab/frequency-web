import { describe, it, expect, beforeEach, vi } from 'vitest'

// DELETING A CIRCLE IS AN OWNERSHIP ACT (SCAN-689).
//
// ADR-1014 widened `circle.editSettings` to a volunteer_role Admin, and `deleteCircle` was gated on
// that same capability, so an Admin the Host promoted could type the confirm and erase the Host's
// circle: memberships, invites, tasks and practices cascade away, with no undo and no say from the
// Host. The action runs through the admin client, so RLS never applies; THIS gate is the only one.
//
// The delete now follows `circle.manageRoles`, the capability that marks a LEAD (the Host, staff,
// or the managing guide/mentor of the parent) and never a rung. Two halves, both network-free:
//   1. the ACTION refuses an editSettings-only caller before touching a row;
//   2. the RAIL's data carries `can_delete` from the same capability, so the control is not drawn
//      for someone the action would refuse.

let capabilities = new Set<string>()
const writes: { table: string; op: string }[] = []

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/core/load-capabilities', () => ({
  getCircleCapabilities: async () => capabilities,
}))
vi.mock('@/lib/practices', () => ({
  listPublicPractices: async () => [],
  getCircleActivePractice: async () => null,
}))
vi.mock('@/lib/circles/challenges', () => ({
  getCircleChallenges: async () => [],
  listAdoptableChallenges: async () => [],
}))
vi.mock('@/lib/channels/programs', () => ({ setCircleChannels: vi.fn(async () => []) }))
vi.mock('@/lib/auth', () => ({ getMyProfileId: async () => 'host-1' }))
vi.mock('@/lib/admin/audit', () => ({ logAdminAction: vi.fn(async () => undefined) }))

vi.mock('@/lib/supabase/admin', () => {
  const CIRCLE = { id: 'circle-1', slug: 'sound-bath', name: 'Sound Bath', space_id: null, access: 'open' }
  const chain = (table: string, op: string) => {
    if (op !== 'select') writes.push({ table, op })
    const node: Record<string, unknown> = {}
    const self = () => node
    node.eq = self
    node.in = self
    node.order = self
    node.limit = self
    node.maybeSingle = async () => ({ data: table === 'circles' ? CIRCLE : null, error: null })
    node.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve({ data: [], error: null }).then(resolve, reject)
    return node
  }
  return {
    createAdminClient: () => ({
      from: (table: string) => ({
        select: () => chain(table, 'select'),
        update: () => chain(table, 'update'),
        delete: () => chain(table, 'delete'),
      }),
    }),
  }
})

import { deleteCircle, getCircleAdminData } from './admin-actions'

const ADMIN_RUNG = ['circle.view', 'circle.post', 'circle.moderate', 'circle.editSettings', 'circle.assignTask', 'circle.broadcast']
const LEAD = [...ADMIN_RUNG, 'circle.manageRoles']

beforeEach(() => {
  writes.length = 0
})

describe('deleteCircle is gated on circle.manageRoles, not circle.editSettings', () => {
  it('refuses a volunteer_role Admin before touching a row', async () => {
    capabilities = new Set(ADMIN_RUNG)
    await expect(deleteCircle('circle-1', 'sound-bath')).rejects.toThrow('Unauthorized')
    expect(writes).toEqual([])
  })

  it('lets a lead delete', async () => {
    capabilities = new Set(LEAD)
    await expect(deleteCircle('circle-1', 'sound-bath')).resolves.toEqual({})
    expect(writes).toContainEqual({ table: 'circles', op: 'delete' })
  })
})

describe('the rail draws the delete control only for a lead', () => {
  it('an Admin can open Settings but can_delete is false', async () => {
    capabilities = new Set(ADMIN_RUNG)
    const data = await getCircleAdminData('sound-bath')
    expect(data).not.toBeNull()
    expect(data?.can_delete).toBe(false)
  })

  it('a lead gets can_delete true', async () => {
    capabilities = new Set(LEAD)
    const data = await getCircleAdminData('sound-bath')
    expect(data?.can_delete).toBe(true)
  })
})
