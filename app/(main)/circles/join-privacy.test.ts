import { describe, it, expect, beforeEach, vi } from 'vitest'
import { isError, type ActionResult } from '@/lib/action-result'

// joinCircle × CIRCLE ACCESS (ADR-1015 · C1, two-axis model).
//
// 🔴 WHY THIS TEST EXISTS AT THE ACTION LAYER. joinCircle uses the SERVICE-ROLE client by design,
// with a comment saying so: the `memberships` insert policy only lets crew+ self-join, while an
// ordinary member joining a circle is the most common write in the product. Service role holds
// BYPASSRLS, so `circles_access_restrictive` — the whole database half of C1 — is invisible here.
// And the gate is load-bearing in a way the read paths are not: joining WRITES a memberships row,
// and a memberships row is exactly what `can_enter_circle` reads. Without a refusal here, a
// stranger who learns a closed circle's id joins it and thereby grants themselves entry. The model
// would be circular.
//
// ⚠️ NOTE WHICH AXIS IS ABSENT. `unlisted` never enters this decision. A LISTED closed circle is
// precisely one a stranger is MEANT to find and then be refused until they are invited, buy the
// tier, or belong to the Space — that refusal is the lead funnel working.
//
// What is locked, all network-free (admin client, auth, gamification and the email/AI graph mocked,
// mirroring invite-by-email.test.ts):
//   1. Every closed mode refuses a stranger, with copy IDENTICAL to the missing-circle copy — so
//      the refusal never confirms the circle exists or hints at its shape.
//   2. Each mode's own door opens: an invite (the QR route), a Space seat for `space_members`.
//   3. Existing members, the Host and platform staff are never locked out.
//   4. `open` circles stay self-serve, listed or not — the gate narrows nothing it should not.
//   5. Capacity still runs, and still runs AFTER the access gate.

let currentProfileId: string | null = 'stranger-1'
let staff = false
let circleRow: Record<string, unknown> | null = {}
let existingMembership: { id: string } | null = null
let spaceSeat: { role: string } | null = null
const membershipInserts: Record<string, unknown>[] = []

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))

vi.mock('@/lib/auth', () => ({
  getMyProfileId: async () => currentProfileId,
  isPlatformStaff: async () => staff,
}))

vi.mock('@/lib/achievements', () => ({ processGamificationEvent: vi.fn(async () => {}) }))
vi.mock('@/lib/gems', () => ({ awardGems: vi.fn(async () => {}) }))
vi.mock('@/lib/analytics/track', () => ({ track: vi.fn(async () => {}) }))
vi.mock('@/lib/email', () => ({ sendInviteEmail: vi.fn(async () => {}) }))
vi.mock('@/lib/site', () => ({ SITE_URL: 'https://frequencylocal.com' }))
vi.mock('@/lib/core/load-capabilities', () => ({ getCircleCapabilities: async () => new Set() }))
vi.mock('@/lib/ai/circle-spark', () => ({
  suggestCircleDraft: vi.fn(async () => null),
  fallbackCircleSuggestion: vi.fn(() => ({})),
}))
vi.mock('@/lib/beta/referral-contest', () => ({ recordCircleStarterMilestone: vi.fn(async () => {}) }))

// Table-aware mock: the access gate reads `circles`, then `memberships` and (only for
// space_members) `space_members`, so each has to answer for itself.
vi.mock('@/lib/supabase/admin', () => {
  const rowFor = (table: string) => {
    if (table === 'circles') return circleRow
    if (table === 'memberships') return existingMembership
    if (table === 'space_members') return spaceSeat
    return null
  }
  const chain = (table: string) => {
    const node: Record<string, unknown> = {}
    node.eq = () => node
    node.maybeSingle = async () => ({ data: rowFor(table), error: null })
    return node
  }
  return {
    createAdminClient: () => ({
      from: (table: string) => ({
        select: () => chain(table),
        insert: (row: Record<string, unknown>) => {
          if (table === 'memberships') membershipInserts.push(row)
          return Promise.resolve({ error: null })
        },
      }),
    }),
  }
})

import { joinCircle } from './actions'

const CLOSED = {
  member_count: 2,
  member_cap: 50,
  hub_id: null,
  access: 'circle_members',
  unlisted: false, // LISTED and closed: the lead funnel
  space_id: 'space-1',
  host_id: 'host-1',
}

const CLOSED_MODES = ['circle_members', 'invite', 'tier', 'space_members'] as const

beforeEach(() => {
  currentProfileId = 'stranger-1'
  staff = false
  existingMembership = null
  spaceSeat = null
  circleRow = { ...CLOSED }
  membershipInserts.length = 0
})

describe('every closed access mode refuses a stranger', () => {
  for (const access of CLOSED_MODES) {
    it(`${access}: refused, and no membership row is written`, async () => {
      circleRow = { ...CLOSED, access }
      const res = await joinCircle('circle-1', 'closed-circle')
      expect(isError(res as ActionResult)).toBe(true)
      expect(membershipInserts).toHaveLength(0)
    })
  }

  it('the refusal copy is identical to the missing-circle copy, so it never confirms the circle exists', async () => {
    const refusedClosed = (await joinCircle('circle-1', 'closed-circle')) as { error?: string }
    circleRow = null
    const refusedMissing = (await joinCircle('circle-nope', 'nope')) as { error?: string }
    expect(refusedClosed.error).toBeTruthy()
    expect(refusedClosed.error).toBe(refusedMissing.error)
  })

  it('every closed mode refuses with the SAME string — a per-mode message would hint at its shape', async () => {
    const errors = new Set<string>()
    for (const access of CLOSED_MODES) {
      circleRow = { ...CLOSED, access }
      errors.add(((await joinCircle('circle-1', 'closed-circle')) as { error?: string }).error ?? '')
    }
    expect(errors.size).toBe(1)
  })

  it('a signed-out caller is refused before anything is read', async () => {
    currentProfileId = null
    const res = await joinCircle('circle-1', 'closed-circle')
    expect(isError(res as ActionResult)).toBe(true)
    expect(membershipInserts).toHaveLength(0)
  })

  it('refusing does NOT depend on the discoverability axis — listed and unlisted refuse alike', async () => {
    circleRow = { ...CLOSED, unlisted: true }
    const hidden = (await joinCircle('circle-1', 'hidden')) as { error?: string }
    circleRow = { ...CLOSED, unlisted: false }
    const funnel = (await joinCircle('circle-1', 'funnel')) as { error?: string }
    expect(hidden.error).toBe(funnel.error)
    expect(membershipInserts).toHaveLength(0)
  })
})

describe('each mode`s own door opens', () => {
  it('the QR route`s invited: true opens an invite circle', async () => {
    circleRow = { ...CLOSED, access: 'invite' }
    await joinCircle('circle-1', 'closed-circle', { invited: true })
    expect(membershipInserts).toHaveLength(1)
  })

  it("a Space seat opens a space_members circle — the owner's own example", async () => {
    circleRow = { ...CLOSED, access: 'space_members' }
    spaceSeat = { role: 'viewer' }
    await joinCircle('circle-1', 'closed-circle')
    expect(membershipInserts).toHaveLength(1)
  })

  it('that same Space seat does NOT open a circle_members circle in the same Space', async () => {
    circleRow = { ...CLOSED, access: 'circle_members' }
    spaceSeat = { role: 'viewer' }
    const res = await joinCircle('circle-1', 'closed-circle')
    expect(isError(res as ActionResult)).toBe(true)
    expect(membershipInserts).toHaveLength(0)
  })

  it('an existing active member re-joining is not refused', async () => {
    existingMembership = { id: 'm-1' }
    await joinCircle('circle-1', 'closed-circle')
    expect(membershipInserts).toHaveLength(1)
  })

  it('the Host is not locked out of their own circle', async () => {
    currentProfileId = 'host-1'
    await joinCircle('circle-1', 'closed-circle')
    expect(membershipInserts).toHaveLength(1)
  })

  it('platform staff keep break-glass', async () => {
    staff = true
    await joinCircle('circle-1', 'closed-circle')
    expect(membershipInserts).toHaveLength(1)
  })
})

describe('joinCircle narrows nothing that was open before', () => {
  for (const unlisted of [false, true]) {
    it(`an OPEN circle stays self-serve for a stranger (unlisted: ${unlisted})`, async () => {
      circleRow = { ...CLOSED, access: 'open', unlisted }
      await joinCircle('circle-1', 'open-circle')
      expect(membershipInserts).toHaveLength(1)
    })
  }

  it('capacity is still enforced, and still enforced AFTER the access gate', async () => {
    circleRow = { ...CLOSED, access: 'open', member_count: 50, member_cap: 50 }
    const res = (await joinCircle('circle-1', 'full-circle')) as { error?: string }
    expect(res.error).toContain('full')
    expect(membershipInserts).toHaveLength(0)
  })
})
