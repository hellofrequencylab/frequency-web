import { describe, it, expect } from 'vitest'
import { sourceWithoutComments } from '@/test/source-shape'

// SCAN-743 (2026-10-05): the live /join finisher never claimed the Space lead-grab, the sealed
// lead's touchpoint or the inviter's connector reward; only completeOnboarding did, behind a
// redirect to /join. Both finishers now call runClaimOnJoin (lib/onboarding/claim-on-join.ts).
//
// Source-level, in the house archetype (actions.meta.test.ts beside this file): writeInduction
// fans out to a dozen server modules, so a behavioural harness here would be mostly mocks of
// things that are not under test. The helper's own behaviour (the three calls, the cookie slot,
// fail-safety) is pinned in lib/onboarding/claim-on-join.test.ts. Comments are stripped before
// matching so the header that names the gap cannot satisfy or trip it.

const join = sourceWithoutComments('app/join/(induction)/actions.ts', { imports: true })
const legacy = sourceWithoutComments('app/onboarding/actions.ts', { imports: true })
const helper = sourceWithoutComments('lib/onboarding/claim-on-join.ts', { imports: true })

function body(code: string, head: string): string {
  const start = code.indexOf(head)
  expect(start).toBeGreaterThan(-1)
  const next = code.indexOf('\nasync function ', start + head.length)
  const nextExport = code.indexOf('\nexport async function ', start + head.length)
  const ends = [next, nextExport].filter((i) => i > 0)
  return code.slice(start, ends.length ? Math.min(...ends) : code.length)
}

describe('claim-on-join runs from the live /join finisher', () => {
  it('writeInduction calls runClaimOnJoin after attribution and before the welcome', () => {
    const w = body(join, 'async function writeInduction')
    const claim = w.indexOf('await runClaimOnJoin(prof.id as string, user.email, supabase)')
    expect(claim).toBeGreaterThan(-1)
    expect(w.indexOf('await persistAcquisition(')).toBeLessThan(claim)
    expect(w.indexOf('postWelcomeForMember(prof.id')).toBeGreaterThan(claim)
  })

  it('completeOnboarding uses the same helper instead of its own copy', () => {
    const c = body(legacy, 'export async function completeOnboarding')
    expect(c).toContain('await runClaimOnJoin(updated.id, user.email, supabase)')
    expect(c).not.toContain('claimPendingLeadGrab(')
    expect(c).not.toContain('rewardConnectorJoinOnSignup(')
  })

  it('the helper carries all three claim calls and the guest seat claim', () => {
    for (const name of ['claimPendingLeadGrab(', 'claimLeadOnSignup(', 'rewardConnectorJoinOnSignup(', "'claim_guest_rsvps'"]) {
      expect(helper).toContain(name)
    }
  })
})
