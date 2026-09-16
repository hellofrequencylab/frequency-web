import { describe, expect, it, vi, beforeEach } from 'vitest'
import { savedCardParamsFor, createAllowingSavedCard } from './saved-card'
import type { SupabaseClient } from '@supabase/supabase-js'

// A Supabase stub whose single read answers whatever this test wants. Deliberately minimal: the
// only query this module makes is one maybeSingle() on `profiles`.
function dbReturning(result: { data: unknown; error: { message: string } | null }): SupabaseClient {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => result }),
      }),
    }),
    // ADR-246 bans casting the ADMIN client to an untyped SupabaseClient in app code, because
    // that discards the generated schema types on a real query. This is a TEST DOUBLE with no
    // query builder behind it at all: the module under test makes exactly one
    // `.from('profiles').select().eq().maybeSingle()` call and this stub answers it. There is no
    // typed object to cast instead.
    // eslint-disable-next-line no-restricted-syntax -- test double, see above
  } as unknown as SupabaseClient
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('savedCardParamsFor — who may save a card', () => {
  it('reuses the customer a member already has', async () => {
    const out = await savedCardParamsFor(dbReturning({ data: { stripe_customer_id: 'cus_123' }, error: null }), 'p1', 't')
    expect(out).toEqual({ params: { customer: 'cus_123' } })
  })

  it('asks Stripe to mint one for a member who has none yet', async () => {
    const out = await savedCardParamsFor(dbReturning({ data: { stripe_customer_id: null }, error: null }), 'p1', 't')
    expect(out).toEqual({ params: { customer_creation: 'always' } })
  })

  it('NEVER sends both customer and customer_creation', async () => {
    // Stripe rejects the pair, and a rejection here takes the whole purchase with it.
    for (const data of [{ stripe_customer_id: 'cus_1' }, { stripe_customer_id: null }, null]) {
      const out = await savedCardParamsFor(dbReturning({ data, error: null }), 'p1', 't')
      const keys = Object.keys('params' in out ? out.params : {})
      expect(keys).not.toEqual(expect.arrayContaining(['customer', 'customer_creation']))
    }
  })

  it('offers a GUEST nothing at all — there is no account for a card to belong to', async () => {
    const db = dbReturning({ data: { stripe_customer_id: 'cus_should_not_be_read' }, error: null })
    const out = await savedCardParamsFor(db, null, 't')
    expect(out).toEqual({ params: {} })
  })

  it('🔴 FAILS CLOSED on an unreadable row, rather than minting a duplicate customer', async () => {
    // SCAN-539. A PostgREST failure arrives in `error`, not as a throw. Reading it as "no customer
    // yet" would mint a SECOND customer for a member who already had one, and that split is
    // permanent. Refusing costs one retryable checkout.
    const out = await savedCardParamsFor(dbReturning({ data: null, error: { message: 'boom' } }), 'p1', 't')
    expect(out).toEqual({ error: true })
  })

  it('a genuinely absent profile row is NOT an error', async () => {
    const out = await savedCardParamsFor(dbReturning({ data: null, error: null }), 'p1', 't')
    expect(out).toEqual({ params: { customer_creation: 'always' } })
  })
})

describe('createAllowingSavedCard — the convenience is what gets dropped', () => {
  it('passes the saved-card parameters through on the happy path', async () => {
    const create = vi.fn(async (extra: Record<string, string>) => ({ id: 'cs_1', extra }))
    const out = await createAllowingSavedCard(create, { customer: 'cus_1' }, 't')
    expect(create).toHaveBeenCalledTimes(1)
    expect(out).toEqual({ id: 'cs_1', extra: { customer: 'cus_1' } })
  })

  it('🔴 retries WITHOUT them when Stripe refuses, so the purchase still happens', async () => {
    // The whole point. `stripe` ships no types, so nothing in the build can tell us whether
    // customer_creation is accepted alongside ui_mode:'elements' on a destination charge. A
    // rejected parameter must cost the convenience, never the sale.
    const create = vi
      .fn()
      .mockRejectedValueOnce(new Error('Unknown parameter: customer_creation'))
      .mockResolvedValueOnce({ id: 'cs_fallback' })
    const out = await createAllowingSavedCard(create, { customer_creation: 'always' }, 't')
    expect(create).toHaveBeenCalledTimes(2)
    expect(create).toHaveBeenNthCalledWith(1, { customer_creation: 'always' })
    expect(create).toHaveBeenNthCalledWith(2, {})
    expect(out).toEqual({ id: 'cs_fallback' })
  })

  it('the degrade is LOUD — a silent one would read as "saved cards are live"', async () => {
    const create = vi.fn().mockRejectedValueOnce(new Error('nope')).mockResolvedValueOnce({ id: 'cs_2' })
    await createAllowingSavedCard(create, { customer: 'cus_1' }, 'tickets')
    expect(console.error).toHaveBeenCalled()
    const logged = (console.error as unknown as { mock: { calls: unknown[][] } }).mock.calls[0].join(' ')
    expect(logged).toContain('tickets')
  })

  it('does not retry when there was nothing to drop (a guest)', async () => {
    const create = vi.fn(async () => ({ id: 'cs_3' }))
    await createAllowingSavedCard(create, {}, 't')
    expect(create).toHaveBeenCalledTimes(1)
    expect(create).toHaveBeenCalledWith({})
  })

  it('a second failure is not swallowed — it throws, because now the SESSION failed', async () => {
    const create = vi.fn().mockRejectedValue(new Error('stripe is down'))
    await expect(createAllowingSavedCard(create, { customer: 'cus_1' }, 't')).rejects.toThrow('stripe is down')
  })
})
