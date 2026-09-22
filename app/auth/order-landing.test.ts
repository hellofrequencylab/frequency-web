import { describe, it, expect } from 'vitest'
import { sourceWithoutComments } from '@/test/source-shape'

// ── A PAID JOURNEY DECIDES THE SIGN-IN LANDING, BEHIND THE SEAT AND AHEAD OF THE FUNNEL ──────────
//
// PROG-GD5. The order claim used to return void on purpose, deferring the landing to the seat
// claim. That left the commonest guest, one who opens the magic link in a different browser than
// the one that paid (no fq_post_login cookie, no ?next=), on /feed with a Journey they paid for and
// no sign of it. These pin the three things that make the recovery safe:
//   · the callback READS the order claim's answer instead of discarding it;
//   · precedence is seat, then welcome, then funnel: an event happening right now outranks a
//     purchase that keeps, and a purchase outranks "resume the thing you asked for";
//   · every recovery still sits behind !hasExplicitNext, so a destination that was actually asked
//     for is never overruled by a claim.
//
// Comment-stripped (LIVE-167): each needle must hit code, never the prose that describes it.
const callback = sourceWithoutComments('app/auth/callback/route.ts', { imports: true })

describe('the order claim names the landing', () => {
  it('the callback keeps the welcome the claim returns', () => {
    expect(callback).toMatch(/orderLanding = await claimGuestOrdersOnSignIn\(/)
  })

  it('🔴 seat, then welcome, then funnel', () => {
    expect(callback).toContain('seatLanding ?? orderLanding ?? funnelLanding')
  })

  it('and none of the three overrules a destination that was asked for', () => {
    expect(callback).toContain('!hasExplicitNext && recovered')
  })
})

describe('the claim module answers with a welcome path, not a bare slug', () => {
  const claim = sourceWithoutComments('lib/commerce/claim-guest-orders-on-sign-in.ts', { imports: true })

  it('returns journeyWelcomePath for a fulfilled order and null otherwise', () => {
    expect(claim).toMatch(/Promise<string \| null>/)
    expect(claim).toContain('return journeyWelcomePath(slug)')
    // Only an order whose enrolment ran can be the landing: the welcome refuses the others.
    expect(claim).toMatch(/for \(const orderId of fulfilled\)/)
  })
})
