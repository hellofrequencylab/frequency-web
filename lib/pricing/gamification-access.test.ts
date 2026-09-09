import { describe, it, expect, vi, beforeEach } from 'vitest'

// SCAN-539 — the profile read behind resolveViewerGamificationAccess (lib/pricing/gamification-access.ts).
//
// A PostgREST failure arrives in `error`, not as a throw, so the module's documented try/catch never
// engaged; the unchecked null fell into the `!data` arm and a signed-in, paid, full-access member was
// silently DOWNGRADED to 'earn_only' — the entitlement they bought disappearing with no error shown.
//
// DIRECTION: FAIL OPEN, which is what this module's header has always promised ("any DB/flag error
// degrades to today's behavior, never to a lockout"), and what its sibling gamificationFullAllowed
// did before ADR-1295 deleted it with the `gamification_full` gate. On an unreadable profile there is no tier to derive from, so the choice is between
// revoking a paid entitlement for the length of an outage and letting a free member see the full loop
// for one request. The second is the smaller wrong answer. A genuinely absent profile row (data null,
// no error) is NOT an outage and still reads 'earn_only'.

type Result = { data: unknown; error: { message: string } | null }

const state = vi.hoisted(() => {
  let result: Result = { data: null, error: null }
  let user: { id: string } | null = { id: 'auth-1' }
  return {
    get result() {
      return result
    },
    get user() {
      return user
    },
    set(r: Result) {
      result = r
    },
    setUser(u: { id: string } | null) {
      user = u
    },
  }
})

vi.mock('@/lib/auth', () => ({ getCachedUser: async () => state.user }))
vi.mock('./settings', () => ({
  featureGatesLive: async () => false,
  loadPricingFlags: async () => ({ gamification_full_member: false, gamification_full_crew: true }),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b: any = {
      from: () => b,
      select: () => b,
      eq: () => b,
      maybeSingle: () => Promise.resolve(state.result),
    }
    return b
  },
}))

import { resolveViewerGamificationAccess } from './gamification-access'

beforeEach(() => {
  state.set({ data: null, error: null })
  state.setUser({ id: 'auth-1' })
  vi.spyOn(console, 'error').mockImplementation(() => {}).mockClear()
})

describe('resolveViewerGamificationAccess — an unreadable profile (SCAN-539)', () => {
  it('does NOT downgrade a signed-in member to earn_only on a read error', async () => {
    state.set({ data: null, error: { message: '57014 statement timeout' } })
    // Old behaviour: the unchecked null landed in the `!data` arm and returned 'earn_only', revoking a
    // paid member's full access for the duration of the outage.
    expect(await resolveViewerGamificationAccess()).toBe('full')
  })

  it('leaves a trace when it grants on an error (a swallowed failure is an invisible regression)', async () => {
    state.set({ data: null, error: { message: '57014 statement timeout' } })
    await resolveViewerGamificationAccess()
    expect(console.error).toHaveBeenCalled()
  })

  it('an absent profile row is not an outage: still earn_only, and nothing is logged', async () => {
    state.set({ data: null, error: null })
    expect(await resolveViewerGamificationAccess()).toBe('earn_only')
    expect(console.error).not.toHaveBeenCalled()
  })

  it('an anonymous viewer is still earn_only', async () => {
    state.setUser(null)
    expect(await resolveViewerGamificationAccess()).toBe('earn_only')
  })

  it('a clean read still derives from the tier + flags', async () => {
    state.set({ data: { membership_tier: 'free', gamification_access_override: null }, error: null })
    expect(await resolveViewerGamificationAccess()).toBe('earn_only')
    state.set({ data: { membership_tier: 'crew', gamification_access_override: null }, error: null })
    expect(await resolveViewerGamificationAccess()).toBe('full')
  })
})
