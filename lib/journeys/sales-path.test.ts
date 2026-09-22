import { describe, it, expect } from 'vitest'
import {
  CHECKOUT_SESSION_PLACEHOLDER,
  isJourneyWelcomePath,
  journeyBuySignInPath,
  journeyLearnPath,
  journeyMemberPath,
  journeyPublicPath,
  journeyWelcomeDoor,
  journeyWelcomePath,
} from './sales-path'

// ── THE WELCOME (PROG-GD5) ───────────────────────────────────────────────────────────────────────
describe('the welcome after a purchase', () => {
  it('is a member page under the Journey, carrying the session id when there is one', () => {
    expect(journeyWelcomePath('heart-on-fire')).toBe('/journeys/heart-on-fire/welcome')
    expect(journeyWelcomePath('heart-on-fire', 'cs_test_1')).toBe(
      '/journeys/heart-on-fire/welcome?session_id=cs_test_1',
    )
  })

  it('a stranger reaches it through sign-in, with the address that paid prefilled', () => {
    expect(journeyWelcomeDoor('heart-on-fire', { email: 'sam@example.com' })).toBe(
      '/sign-in?next=/journeys/heart-on-fire/welcome&email=sam%40example.com',
    )
  })

  it('🔴 keeps the Stripe placeholder bare so success_url is actually substituted', () => {
    const door = journeyWelcomeDoor('heart-on-fire', { sessionId: CHECKOUT_SESSION_PLACEHOLDER })
    expect(door).toContain('session_id={CHECKOUT_SESSION_ID}')
    expect(door).not.toContain('%7B')
    // And the sign-in page will accept what it reads: a single leading slash, never `//`.
    const next = new URL(door, 'https://freq.test').searchParams.get('next')
    expect(next).toBe('/journeys/heart-on-fire/welcome?session_id={CHECKOUT_SESSION_ID}')
  })

  it('recognises its own destination and nothing else', () => {
    expect(isJourneyWelcomePath('/journeys/heart-on-fire/welcome')).toBe(true)
    expect(isJourneyWelcomePath('/journeys/heart-on-fire/welcome?session_id=cs_1')).toBe(true)
    expect(isJourneyWelcomePath('/journeys/heart-on-fire')).toBe(false)
    expect(isJourneyWelcomePath('/journeys/heart-on-fire/learn')).toBe(false)
    expect(isJourneyWelcomePath(null)).toBe(false)
  })
})

describe('journey sales paths', () => {
  it('keeps the till on the member slug and the canonical on discover', () => {
    expect(journeyMemberPath('heart-on-fire')).toBe('/journeys/heart-on-fire')
    expect(journeyPublicPath('heart-on-fire')).toBe('/discover/journeys/heart-on-fire')
    expect(journeyLearnPath('heart-on-fire')).toBe('/journeys/heart-on-fire/learn')
  })

  it('sends a signed-out buyer to sign-in carrying the till as next', () => {
    expect(journeyBuySignInPath('heart-on-fire')).toBe(
      '/sign-in?next=%2Fjourneys%2Fheart-on-fire',
    )
  })
})
