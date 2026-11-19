// ONLY A PAYING ACCOUNT PROCESSES MONEY (ADR-1978). The rule under test: tips go to a person who pays
// for Crew or owns a Space on a paying plan; donations go to a Space on a paying plan or to a free
// Space whose owner pays for Crew; and "pays for Crew" is the billed column, nothing else.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  tiers: {} as Record<string, string | null>,
  spaces: [] as { id: string; plan: string | null; owner_profile_id: string | null }[],
  paidPlans: new Set(['business', 'collective']),
  fail: false,
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const filters: Record<string, string> = {}
      const rows = () => {
        if (state.fail) return { data: null, error: { message: 'down' } }
        if (table === 'profiles') {
          const id = filters.id
          return id in state.tiers ? { data: { membership_tier: state.tiers[id] }, error: null } : { data: null, error: null }
        }
        const list = state.spaces.filter((s) =>
          Object.entries(filters).every(([k, v]) => (s as Record<string, unknown>)[k] === v),
        )
        return { data: list, error: null }
      }
      const b = {
        select: () => b,
        eq: (k: string, v: string) => ((filters[k] = v), b),
        limit: async () => rows(),
        maybeSingle: async () => {
          const r = rows()
          return Array.isArray(r.data) ? { data: r.data[0] ?? null, error: r.error } : r
        },
      }
      return b
    },
  }),
}))

vi.mock('./payments-gate', () => ({
  spacePaymentsVerdict: async (_id: string, opts: { plan?: string | null } = {}) => {
    const plan = opts.plan !== undefined ? opts.plan : (state.spaces.find((s) => s.id === _id)?.plan ?? null)
    return { ok: !!plan && state.paidPlans.has(plan) }
  },
}))

import { profileCanTakeTips, profilePaysForCrew, spaceMayTakeDonations } from './paying-accounts'

beforeEach(() => {
  state.tiers = { free: 'free', crew: 'crew', blank: null, odd: 'supporter' }
  state.spaces = []
  state.fail = false
})

describe('profilePaysForCrew', () => {
  it('is true only for the billed crew column', async () => {
    expect(await profilePaysForCrew('crew')).toBe(true)
    expect(await profilePaysForCrew('free')).toBe(false)
    expect(await profilePaysForCrew('blank')).toBe(false)
    expect(await profilePaysForCrew('odd')).toBe(false)
    expect(await profilePaysForCrew('missing')).toBe(false)
    expect(await profilePaysForCrew(null)).toBe(false)
  })

  it('fails closed when the read fails', async () => {
    state.fail = true
    expect(await profilePaysForCrew('crew')).toBe(false)
  })
})

describe('profileCanTakeTips', () => {
  it('lets a paying Crew member take tips', async () => {
    expect(await profileCanTakeTips('crew')).toBe(true)
  })

  it('refuses a free member with no Space, or with only a free Space', async () => {
    expect(await profileCanTakeTips('free')).toBe(false)
    state.spaces = [{ id: 's1', plan: 'free', owner_profile_id: 'free' }]
    expect(await profileCanTakeTips('free')).toBe(false)
  })

  it('lets the owner of a Space on a paying plan take tips', async () => {
    state.spaces = [
      { id: 's1', plan: 'free', owner_profile_id: 'free' },
      { id: 's2', plan: 'business', owner_profile_id: 'free' },
    ]
    expect(await profileCanTakeTips('free')).toBe(true)
  })

  it('does not count somebody else’s paying Space', async () => {
    state.spaces = [{ id: 's2', plan: 'business', owner_profile_id: 'crew' }]
    expect(await profileCanTakeTips('free')).toBe(false)
  })
})

describe('spaceMayTakeDonations', () => {
  it('opens on a paying plan whoever owns it', async () => {
    expect(await spaceMayTakeDonations('s', { plan: 'business', ownerProfileId: 'free' })).toBe(true)
  })

  it('opens on a free Space only when its owner pays for Crew', async () => {
    expect(await spaceMayTakeDonations('s', { plan: 'free', ownerProfileId: 'crew' })).toBe(true)
    expect(await spaceMayTakeDonations('s', { plan: 'free', ownerProfileId: 'free' })).toBe(false)
    expect(await spaceMayTakeDonations('s', { plan: 'free', ownerProfileId: null })).toBe(false)
  })

  it('reads the owner itself when the caller did not pass one', async () => {
    state.spaces = [{ id: 's9', plan: 'free', owner_profile_id: 'crew' }]
    expect(await spaceMayTakeDonations('s9')).toBe(true)
    state.spaces = [{ id: 's9', plan: 'free', owner_profile_id: 'free' }]
    expect(await spaceMayTakeDonations('s9')).toBe(false)
  })

  it('fails closed when the read fails', async () => {
    state.fail = true
    expect(await spaceMayTakeDonations('s9')).toBe(false)
  })
})
