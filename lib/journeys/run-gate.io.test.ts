import { describe, it, expect, beforeEach, vi } from 'vitest'

// The IO half of the Run gate, network-free. Two bugs are locked here:
//
//  1. GATE MISMATCH — "Start a journey run" renders on `circle.editSettings`, but resolveRunGate
//     only knew the host FK, the owning Space's editors and platform staff. A circle-scoped Admin
//     (ADR-1014) and the guide who leads the parent hub saw the control and got an error.
//  2. A PICKER FULL OF OPTIONS THAT CANNOT BE PICKED — the dropdown was filled from the whole
//     public library while the action refuses any plan a Space Circle's Space does not offer.
//     `runnableJourneysForCircle` is the one place both rules are read together.

const ROOT_SPACE = 'root-space-id'

// Mutable scenario state.
let circleRow: { host_id: string | null; slug: string; space_id: string | null } | null = null
let editSettings = false
let spaceCanEdit = false
let staff = false
let offeredPlans: Record<string, unknown>[] = []
let publicPlans: { id: string; title: string; slug: string; emoji: string | null }[] = []

vi.mock('@/lib/auth', () => ({ isPlatformStaff: async () => staff }))

vi.mock('@/lib/spaces/store', () => ({
  loadRootSpaceId: async () => ROOT_SPACE,
  getSpaceById: async (id: string) => ({ id, ownerProfileId: null }),
}))

vi.mock('@/lib/spaces/entitlements', () => ({
  getSpaceCapabilities: async () => ({ canEditProfile: spaceCanEdit }),
}))

vi.mock('@/lib/core/load-capabilities', () => ({
  getCircleCapabilities: async () => new Set(editSettings ? ['circle.editSettings'] : []),
}))

vi.mock('@/lib/journey-plans', () => ({ listPublicPlans: async () => publicPlans }))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      select: () => {
        if (table === 'circles') {
          return { eq: () => ({ maybeSingle: async () => ({ data: circleRow }) }) }
        }
        // journey_plans: .eq().neq().order().limit() → { data }
        return {
          eq: () => ({
            neq: () => ({
              order: () => ({ limit: async () => ({ data: offeredPlans }) }),
            }),
          }),
        }
      },
    }),
  }),
}))

import { resolveRunGate, runnableJourneysForCircle } from './run-gate'

beforeEach(() => {
  circleRow = { host_id: 'host-1', slug: 'sunset-circle', space_id: null }
  editSettings = false
  spaceCanEdit = false
  staff = false
  offeredPlans = []
  publicPlans = []
})

describe('resolveRunGate — the affordance and the action ask the same question', () => {
  it('admits a manager who is NOT the host (circle Admin / parent-hub guide)', async () => {
    editSettings = true
    const gate = await resolveRunGate('circle-1', 'circle-admin')
    expect(gate.allowed).toBe(true)
    expect(gate.circleSlug).toBe('sunset-circle')
  })

  it('still refuses a member who manages nothing', async () => {
    const gate = await resolveRunGate('circle-1', 'plain-member')
    expect(gate.allowed).toBe(false)
  })

  it('still admits the host', async () => {
    const gate = await resolveRunGate('circle-1', 'host-1')
    expect(gate.allowed).toBe(true)
  })

  it('normalizes a root-owned circle to spaceId null (a member’s own circle)', async () => {
    circleRow = { host_id: 'host-1', slug: 'sunset-circle', space_id: ROOT_SPACE }
    const gate = await resolveRunGate('circle-1', 'host-1')
    expect(gate.spaceId).toBeNull()
  })

  it('refuses an anonymous caller without reading anything', async () => {
    editSettings = true
    const gate = await resolveRunGate('circle-1', null)
    expect(gate.allowed).toBe(false)
  })
})

describe('runnableJourneysForCircle — every option offered is an option the action accepts', () => {
  it('a SPACE circle is offered only what its Space offers, never the whole library', async () => {
    circleRow = { host_id: 'host-1', slug: 'space-circle', space_id: 'space-9' }
    spaceCanEdit = true
    offeredPlans = [
      { id: 'plan-offered', slug: 'reset', title: 'The Reset', summary: null, emoji: '🌱' },
    ]
    publicPlans = [
      { id: 'plan-library', title: 'Some Library Journey', slug: 'library', emoji: null },
    ]

    const options = await runnableJourneysForCircle('circle-1', 'space-editor')
    expect(options).toEqual([
      { id: 'plan-offered', title: 'The Reset', slug: 'reset', emoji: '🌱' },
    ])
    // The guaranteed-to-fail option is gone.
    expect(options.some((o) => o.id === 'plan-library')).toBe(false)
  })

  it('a member’s own circle keeps the public library (the action filters nothing there)', async () => {
    editSettings = true
    publicPlans = [
      { id: 'plan-library', title: 'Some Library Journey', slug: 'library', emoji: null },
    ]
    const options = await runnableJourneysForCircle('circle-1', 'host-1')
    expect(options).toEqual([
      { id: 'plan-library', title: 'Some Library Journey', slug: 'library', emoji: null },
    ])
  })

  it('offers nothing to a viewer who may not start a run', async () => {
    publicPlans = [{ id: 'plan-library', title: 'Some Library Journey', slug: 'library', emoji: null }]
    expect(await runnableJourneysForCircle('circle-1', 'plain-member')).toEqual([])
  })

  it('caps the list', async () => {
    editSettings = true
    publicPlans = Array.from({ length: 5 }, (_, i) => ({
      id: `plan-${i}`,
      title: `Journey ${i}`,
      slug: `journey-${i}`,
      emoji: null,
    }))
    expect(await runnableJourneysForCircle('circle-1', 'host-1', 2)).toHaveLength(2)
  })
})
