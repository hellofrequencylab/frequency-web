import { describe, it, expect, beforeEach, vi } from 'vitest'
import { isError, type ActionResult } from '@/lib/action-result'

// joinCircle × CIRCLE PRIVACY (ADR-1015 · C1).
//
// 🔴 WHY THIS TEST EXISTS AT THE ACTION LAYER. joinCircle uses the SERVICE-ROLE client by design,
// with a comment saying so: the `memberships` insert policy only lets crew+ self-join, while an
// ordinary member joining a circle is the most common write in the product. Service role holds
// BYPASSRLS, so `circles_visibility_restrictive` — the whole database half of C1 — is invisible
// here. If the refusal is not written in this function, a stranger who learns a private circle's
// id joins it, and joining makes them a member, which makes the RESTRICTIVE policy open for them.
// A privacy model with a self-serve join is not a privacy model.
//
// What is locked, all network-free (admin client, auth, gamification and the email/AI graph mocked,
// mirroring invite-by-email.test.ts):
//   1. A stranger cannot join a PRIVATE circle, and the refusal is the SAME copy a missing circle
//      gets — so it never confirms the circle is real.
//   2. An INVITED caller (the QR route) can.
//   3. An existing member and the Host can (joining is a no-op for them, not a refusal).
//   4. Public and unlisted circles stay self-serve — the gate narrows nothing it should not.
//   5. The membership insert genuinely does not happen on a refusal.

let currentProfileId: string | null = 'stranger-1'
let staff = false
let circleRow: Record<string, unknown> = {}
let existingMembership: { id: string } | null = null
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

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: existingMembership, error: null }) }),
            maybeSingle: async () => ({ data: existingMembership, error: null }),
          }),
          maybeSingle: async () => {
            if (table === 'circles') return { data: circleRow, error: null }
            return { data: null, error: null }
          },
        }),
      }),
      insert: (row: Record<string, unknown>) => {
        if (table === 'memberships') membershipInserts.push(row)
        return Promise.resolve({ error: null })
      },
    }),
  }),
}))

import { joinCircle } from './actions'

const PRIVATE = { member_count: 2, member_cap: 50, hub_id: null, visibility: 'private', space_id: 'root-1', host_id: 'host-1' }

beforeEach(() => {
  currentProfileId = 'stranger-1'
  staff = false
  existingMembership = null
  circleRow = { ...PRIVATE }
  membershipInserts.length = 0
})

describe('joinCircle refuses a private circle to anyone who was not invited', () => {
  it('a stranger is refused, and no membership row is written', async () => {
    const res = await joinCircle('circle-1', 'private-circle')
    expect(isError(res as ActionResult)).toBe(true)
    expect(membershipInserts).toHaveLength(0)
  })

  it('the refusal copy is identical to the missing-circle copy, so it never confirms the circle exists', async () => {
    const refusedPrivate = (await joinCircle('circle-1', 'private-circle')) as { error?: string }
    circleRow = null as unknown as Record<string, unknown>
    const refusedMissing = (await joinCircle('circle-nope', 'nope')) as { error?: string }
    expect(refusedPrivate.error).toBeTruthy()
    expect(refusedPrivate.error).toBe(refusedMissing.error)
  })

  it('a signed-out caller is refused before anything is read', async () => {
    currentProfileId = null
    const res = await joinCircle('circle-1', 'private-circle')
    expect(isError(res as ActionResult)).toBe(true)
    expect(membershipInserts).toHaveLength(0)
  })
})

describe('joinCircle admits the seats that hold an invite or already belong', () => {
  it('the QR route`s invited: true opens it', async () => {
    await joinCircle('circle-1', 'private-circle', { invited: true })
    expect(membershipInserts).toHaveLength(1)
  })

  it('an existing active member re-joining is not refused', async () => {
    existingMembership = { id: 'm-1' }
    await joinCircle('circle-1', 'private-circle')
    expect(membershipInserts).toHaveLength(1)
  })

  it('the Host is not locked out of their own circle', async () => {
    currentProfileId = 'host-1'
    await joinCircle('circle-1', 'private-circle')
    expect(membershipInserts).toHaveLength(1)
  })

  it('platform staff keep break-glass', async () => {
    staff = true
    await joinCircle('circle-1', 'private-circle')
    expect(membershipInserts).toHaveLength(1)
  })
})

describe('joinCircle narrows nothing that was open before', () => {
  for (const visibility of ['public', 'unlisted']) {
    it(`a ${visibility} circle stays self-serve for a stranger`, async () => {
      circleRow = { ...PRIVATE, visibility }
      await joinCircle('circle-1', 'open-circle')
      expect(membershipInserts).toHaveLength(1)
    })
  }

  it('capacity is still enforced, and still enforced AFTER the privacy gate', async () => {
    circleRow = { ...PRIVATE, visibility: 'public', member_count: 50, member_cap: 50 }
    const res = (await joinCircle('circle-1', 'full-circle')) as { error?: string }
    expect(res.error).toContain('full')
    expect(membershipInserts).toHaveLength(0)
  })
})
