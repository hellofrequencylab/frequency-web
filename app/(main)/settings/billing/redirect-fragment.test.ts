import { describe, it, expect } from 'vitest'
import { settingsFragmentFor } from './page'

// LIVE-290, the half of the anchor fix that is easy to lose.
//
// `lib/billing/connect.ts` appends `#payouts` to Stripe's return_url, but `/settings/billing` is a
// pure redirect and RFC 7231 §7.1.2 says a fragment on the ORIGINAL request URL is carried onto the
// target only when the `Location` header has none of its own. This route used to hard-code `#plan`,
// so the connect.ts change alone would have been silently overridden — the probe green, the host
// still landed on the plan card. These cases exist so a revert of page.tsx fails here rather than in
// a support thread six weeks later.
describe('settingsFragmentFor (the Stripe return anchor)', () => {
  it('sends a finished Connect onboarding to the payouts card', () => {
    expect(settingsFragmentFor({ payouts: 'return' })).toBe('#payouts')
  })

  it('sends an abandoned/expired Connect link to the payouts card too', () => {
    // `?payouts=refresh` has no reader today (only 'return' triggers the sync), but it is still a
    // Connect return and belongs on the same card.
    expect(settingsFragmentFor({ payouts: 'refresh' })).toBe('#payouts')
  })

  it('keeps a CHECKOUT return on the plan card, which is what confirms a plan change', () => {
    expect(settingsFragmentFor({ upgraded: '1', session_id: 'cs_test_1' })).toBe('#plan')
    expect(settingsFragmentFor({ bundle: '1', session_id: 'cs_test_1' })).toBe('#plan')
  })

  it('defaults to the plan card for a bare visit', () => {
    expect(settingsFragmentFor({})).toBe('#plan')
  })

  it('ignores a repeated param, which arrives as an array rather than a string', () => {
    // Defensive: Next hands a repeated query key through as string[], and an array is not a Connect
    // return. Falling back to '#plan' is the safe direction — it is the page's own default.
    expect(settingsFragmentFor({ payouts: ['return', 'refresh'] })).toBe('#plan')
  })
})
