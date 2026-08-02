import { describe, it, expect, beforeEach, vi } from 'vitest'

// THE SPACE METER SEAM (ADR-917, docs/VALUE-LADDER.md Phase 3b). What is locked here is not the
// arithmetic (that is feature-meters.test.ts) but the three properties that decide whether a real
// person gets wrongly refused:
//
//   1. FAIL-SAFE IN ONE DIRECTION. Every read path that can go wrong resolves to GRANTED. There must
//      be no input to this module that produces `allowed: false` because something failed.
//   2. THE PLATFORM ROOT HUB IS NEVER METERED. It carries plan = null, which narrows to 'free', so
//      without an explicit carve-out the platform's own 567 contacts and 36 QR codes would be
//      measured against the FREE CUSTOMER allowance.
//   3. NOTHING BITES WHILE THE GATES ARE NOT LIVE, except the one cap that already bit before this
//      work (QR codes), which passes `alwaysOn` precisely so a refactor does not switch it off.

const { mockGatesLive, spaceMaybeSingle } = vi.hoisted(() => ({
  mockGatesLive: vi.fn(),
  spaceMaybeSingle: vi.fn(),
}))

vi.mock('@/lib/pricing/settings', () => ({ featureGatesLive: mockGatesLive }))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'spaces') return { select: () => ({ eq: () => ({ maybeSingle: spaceMaybeSingle }) }) }
      throw new Error(`unexpected table ${table}`)
    },
  }),
}))

import { spaceAllowanceVerdict, spaceAllowanceHeadroom } from './space-allowance'
import { PLACEHOLDER_METER_LIMITS } from './feature-meters'

const FREE_CRM = PLACEHOLDER_METER_LIMITS.space_crm!.free!

beforeEach(() => {
  mockGatesLive.mockReset()
  spaceMaybeSingle.mockReset()
  mockGatesLive.mockResolvedValue(true)
  spaceMaybeSingle.mockResolvedValue({ data: { type: 'business', plan: 'free' } })
})

describe('nothing bites while the feature gates are not live', () => {
  it('grants a free Space wildly over its allowance', async () => {
    mockGatesLive.mockResolvedValue(false)
    const v = await spaceAllowanceVerdict('s1', 'space_crm', 10_000_000)
    expect(v.allowed).toBe(true)
    expect(v.enforced).toBe(false)
  })

  it('headroom is null (no limit applied) while the gates are not live', async () => {
    mockGatesLive.mockResolvedValue(false)
    expect(await spaceAllowanceHeadroom('s1', 'space_crm', 10)).toBeNull()
  })
})

describe('🔴 the platform root hub is never a metered tenant', () => {
  it('is exempt even at 100x the free allowance, and even with plan null', async () => {
    // The exact production row: spaces.type = 'root', spaces.plan = null.
    spaceMaybeSingle.mockResolvedValue({ data: { type: 'root', plan: null } })
    const v = await spaceAllowanceVerdict('root', 'space_crm', 567)
    expect(v.exempt).toBe(true)
    expect(v.allowed).toBe(true)
    expect(v.enforced).toBe(false)
  })

  it('is exempt from an ALWAYS-ON cap too (the QR cap already refuses the root hub a 37th code)', async () => {
    spaceMaybeSingle.mockResolvedValue({ data: { type: 'root', plan: null } })
    const v = await spaceAllowanceVerdict('root', 'space_qr', 36, { alwaysOn: true })
    expect(v.allowed).toBe(true)
  })

  it('a NON-root Space with a null plan is still metered, at the free rung (default-deny)', async () => {
    spaceMaybeSingle.mockResolvedValue({ data: { type: 'business', plan: null } })
    const v = await spaceAllowanceVerdict('s1', 'space_crm', FREE_CRM)
    expect(v.plan).toBe('free')
    expect(v.allowed).toBe(false)
  })
})

describe('🔴 fail-safe in one direction: no error path can refuse a member', () => {
  it('a Space row that cannot be read grants', async () => {
    spaceMaybeSingle.mockResolvedValue({ data: null })
    expect((await spaceAllowanceVerdict('s1', 'space_crm', 10_000)).allowed).toBe(true)
  })

  it('a Space read that THROWS grants', async () => {
    spaceMaybeSingle.mockRejectedValue(new Error('db down'))
    expect((await spaceAllowanceVerdict('s1', 'space_crm', 10_000)).allowed).toBe(true)
  })

  it('a gates-live flag read that THROWS never turns a cap on', async () => {
    mockGatesLive.mockRejectedValue(new Error('flags down'))
    const v = await spaceAllowanceVerdict('s1', 'space_crm', 10_000)
    expect(v.allowed).toBe(true)
    expect(v.enforced).toBe(false)
  })

  it('a blank space id, and a key with no meter, both grant', async () => {
    expect((await spaceAllowanceVerdict('', 'space_crm', 10_000)).allowed).toBe(true)
    expect((await spaceAllowanceVerdict('s1', 'space_whitelabel', 10_000)).allowed).toBe(true)
  })
})

describe('the enforced case, with the grandfather rule applied', () => {
  it('a free Space has room below the allowance and is stopped AT it', async () => {
    expect((await spaceAllowanceVerdict('s1', 'space_crm', FREE_CRM - 1)).allowed).toBe(true)
    expect((await spaceAllowanceVerdict('s1', 'space_crm', FREE_CRM)).allowed).toBe(false)
  })

  it('a Space already over the allowance keeps every contact it has (the effective cap rises to meet it)', async () => {
    const v = await spaceAllowanceVerdict('s1', 'space_crm', 567)
    expect(v.allowance).toBe(FREE_CRM) // the published promise is unchanged
    expect(v.effective).toBe(567) // the applied cap is never below what they hold
    expect(v.grandfathered).toBe(true)
    expect(v.remaining).toBe(0) // growth stops; nothing is removed
  })

  it('a paid plan on an unlimited rung is never enforced', async () => {
    spaceMaybeSingle.mockResolvedValue({ data: { type: 'business', plan: 'collective' } })
    const v = await spaceAllowanceVerdict('s1', 'space_crm', 10_000_000)
    expect(v.allowed).toBe(true)
    expect(v.enforced).toBe(false)
  })

  it('a retired plan label narrows forward rather than falling to free', async () => {
    spaceMaybeSingle.mockResolvedValue({ data: { type: 'business', plan: 'pro' } })
    const v = await spaceAllowanceVerdict('s1', 'space_crm', 10_000)
    expect(v.plan).toBe('business')
    expect(v.allowed).toBe(true)
  })
})

describe('the always-on QR cap keeps biting (a refactor must not switch a live limit off)', () => {
  it('refuses a free Space its 4th code even though the gates are not live', async () => {
    mockGatesLive.mockResolvedValue(false)
    const v = await spaceAllowanceVerdict('s1', 'space_qr', 3, { alwaysOn: true })
    expect(v.allowed).toBe(false)
    expect(mockGatesLive).not.toHaveBeenCalled() // alwaysOn does not consult the flag at all
  })

  it('and a Space over the QR cap keeps every code it has', async () => {
    const v = await spaceAllowanceVerdict('s1', 'space_qr', 36, { alwaysOn: true })
    expect(v.effective).toBe(36)
    expect(v.remaining).toBe(0)
  })
})
