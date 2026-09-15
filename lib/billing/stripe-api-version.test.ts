import { describe, expect, it, vi } from 'vitest'
import Stripe from 'stripe'
import { STRIPE_API_VERSION } from './stripe'

/**
 * The Stripe API version is a CONTRACT, and before it was pinned it was a floating one.
 *
 * `new Stripe(SECRET)` with no options does not inherit the account's dashboard default — it sends
 * a constant compiled into the installed package. So the version every money call in this repo ran
 * against was decided by whatever `stripe` pnpm last resolved, and a routine dependency bump could
 * move it with no diff to review.
 *
 * These tests measure the CONSEQUENCE (what a constructed client would actually send), not the
 * shape of the source, and they fail in BOTH directions: if the pin drifts from the SDK, and if the
 * pin stops reaching the client.
 */
describe('the Stripe API version is pinned, not inherited', () => {
  it('matches the version baked into the installed SDK, so the pin is a no-op today', () => {
    // If someone bumps `stripe` and its baked-in version moves, this fails and the migration
    // becomes a decision someone makes rather than one they inherit.
    expect(STRIPE_API_VERSION).toBe(Stripe.API_VERSION)
  })

  it('PASSES apiVersion to the constructor -- the only thing that differs from not pinning', async () => {
    // ⚠️ TWO earlier versions of this test were unable to fail.
    //   v1 constructed its own client and asserted on that: it measured the test, not the code.
    //   v2 asserted the exported client's resolved version equalled our constant -- but because
    //     the pin deliberately MATCHES the SDK's baked-in value, a pinned and an unpinned client
    //     resolve to the identical string. The assertion was true either way.
    // The one observable difference between pinned and unpinned is whether our module hands the
    // option to the constructor at all, so that is what this measures: a fake Stripe records the
    // options it was constructed with.
    const seen: Array<Record<string, unknown> | undefined> = []
    vi.doMock('stripe', () => {
      class FakeStripe {
        constructor(_key: string, opts?: Record<string, unknown>) {
          seen.push(opts)
        }
        static API_VERSION = '0000-00-00.fake'
      }
      return { default: FakeStripe }
    })
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_notarealkey')
    vi.resetModules()
    try {
      const mod = await import('./stripe')
      expect(seen.length, 'the module should have constructed a Stripe client').toBeGreaterThan(0)
      const opts = seen[0]
      expect(opts, 'the constructor was called with NO options, so the version is unpinned').toBeDefined()
      expect(opts?.apiVersion).toBe(mod.STRIPE_API_VERSION)
    } finally {
      vi.doUnmock('stripe')
      vi.unstubAllEnvs()
      vi.resetModules()
    }
  })

  it('CONTROL: an unpinned client falls back to the SDK constant, never to the account default', () => {
    // This is the claim the pin exists to defeat, asserted directly so the reasoning cannot rot.
    // If stripe-node ever DID start deferring to the account, this control would fail and the
    // comment above would need rewriting.
    const unpinned = new Stripe('sk_test_notarealkey')
    expect((unpinned as unknown as { _api: { version: string } })._api.version).toBe(Stripe.API_VERSION)
  })

  it('is a real dated Stripe version string, not an empty or placeholder value', () => {
    // Floor: a guard comparing two empty strings passes while measuring nothing.
    expect(STRIPE_API_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}(\.[a-z]+)?$/)
    expect(Stripe.API_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}(\.[a-z]+)?$/)
  })
})
