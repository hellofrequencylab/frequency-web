import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE DISCOVERY ENTRY POINT REACHES CHECKOUT (LIVE-219).
//
// The defect this file exists against was NOT in the classifier. `classifyOrderSource` was correct,
// well tested, and accepted `entryPoint: 'marketplace'` from the day it shipped — nothing ever passed
// it. `startCheckoutAction` called `createCommerceCheckout` with no entry point, so every cold
// Buy-button sale fell through to the default `self` and took a **0% platform fee**. A correct
// function nobody feeds is indistinguishable from a missing one, and only the CALL SITE shows it.
//
// So this file tests the WIRING, which order-source.test.ts cannot see:
//   1. the action forwards a marketplace entry point, and NARROWS anything else to null
//   2. the Market (discovery) surface passes it — on BOTH branches, variants and plain
//   3. the Store (the seller's own storefront) deliberately does NOT
//
// (3) is the half most likely to be "tidied" into a bug later, so it is asserted as a REQUIREMENT
// with its reason, not left as an absence someone reads as an oversight. ADR-811 promises 0% on a
// seller's own audience; a buyer on `/store/[id]` arrived by a link the seller shared, so Frequency
// made no introduction and there is nothing to charge for.
//
// ⚠️ WHAT THIS FILE DOES NOT CLAIM: `startCheckoutAction` is a server action, so its arguments are
// client-supplied. The narrowing test below pins that a crafted value cannot invent an entry point,
// but a client can still simply omit one. That is not a regression — omitting is what 100% of clients
// effectively did before this change — and it is why the narrowing is a literal check rather than a
// pass-through. A tamper-proof signal needs the entry point recorded at page render.
// ─────────────────────────────────────────────────────────────────────────────────────────────

const { getMyProfileId, createCommerceCheckout } = vi.hoisted(() => ({
  getMyProfileId: vi.fn(),
  createCommerceCheckout: vi.fn(),
}))

vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getMyProfileId, getCallerProfile: vi.fn() }))
vi.mock('@/lib/commerce/checkout', () => ({ createCommerceCheckout }))
vi.mock('@/lib/commerce/products', () => ({
  createProduct: vi.fn(),
  setProductStatus: vi.fn(),
  deleteProduct: vi.fn(),
  productOwnerProfileId: vi.fn(),
}))
vi.mock('@/lib/ai/listing-copy', () => ({ draftListingCopy: vi.fn() }))
vi.mock('@/lib/ai/vera/create-entity', () => ({ proposeAndConfirmCreate: vi.fn() }))

import { startCheckoutAction } from './commerce-actions'

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), 'utf8')

/** The entry point the action actually handed to checkout on the most recent call. */
function forwardedEntryPoint(): unknown {
  const last = createCommerceCheckout.mock.calls.at(-1)
  if (!last) throw new Error('createCommerceCheckout was never called')
  return (last[0] as { entryPoint?: unknown }).entryPoint
}

describe('LIVE-219 · the entry point reaches createCommerceCheckout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getMyProfileId.mockResolvedValue('buyer-1')
    createCommerceCheckout.mockResolvedValue({ url: 'https://checkout.stripe.test/x' })
  })

  it('forwards a marketplace entry point, so a discovery sale can classify network', async () => {
    await startCheckoutAction('prod-1', null, 'marketplace')
    expect(forwardedEntryPoint()).toBe('marketplace')
  })

  it('sends null when the surface passes nothing — the storefront case, and the 0% default', async () => {
    await startCheckoutAction('prod-1', null)
    expect(forwardedEntryPoint()).toBeNull()
  })

  it('NARROWS an unrecognised value to null rather than trusting the client', async () => {
    // A server action's arguments come from the browser. Anything that is not the exact literal must
    // collapse to null; it must never reach classifyOrderSource as an entry point of its own.
    await startCheckoutAction('prod-1', null, 'discovery' as unknown as 'marketplace')
    expect(forwardedEntryPoint()).toBeNull()
    await startCheckoutAction('prod-1', null, ' marketplace' as unknown as 'marketplace')
    expect(forwardedEntryPoint()).toBeNull()
  })

  it('still refuses a signed-out buyer before any checkout is attempted', async () => {
    getMyProfileId.mockResolvedValue(null)
    const res = await startCheckoutAction('prod-1', null, 'marketplace')
    expect(res.error).toBeTruthy()
    expect(createCommerceCheckout).not.toHaveBeenCalled()
  })
})

describe('LIVE-219 · which surfaces declare the entry point', () => {
  const market = read('app', '(main)', 'market', '[id]', 'page.tsx')
  const store = read('app', '(main)', 'store', '[id]', 'page.tsx')
  const picker = read('components', 'marketplace', 'variant-picker.tsx')

  it('the Market passes entryPoint on EVERY buy path, variants and plain alike', () => {
    // The no-variant branch renders a bare <BuyButton> and is the easy one to forget; a product
    // without variants is still a discovery sale.
    const tags = market.match(/<(?:BuyButton|VariantPicker)[\s\S]*?\/>/g) ?? []
    expect(tags.length).toBeGreaterThanOrEqual(2)
    for (const tag of tags) expect(tag).toMatch(/entryPoint=["{]?["']?marketplace/)
  })

  it('the VariantPicker forwards it rather than deciding for itself', () => {
    expect(picker).toMatch(/entryPoint\??:/)
    expect(picker).toMatch(/<BuyButton[^>]*entryPoint=\{entryPoint\}/)
  })

  it('🔴 the Store passes NO entry point, because a seller’s own link is not an introduction', () => {
    // Asserted as a requirement, not left as an absence. Adding entryPoint here would charge the
    // network rate on a seller's own audience — the exact promise ADR-811 is built on.
    const tags = store.match(/<BuyButton[\s\S]*?\/>/g) ?? []
    expect(tags.length).toBeGreaterThanOrEqual(1)
    for (const tag of tags) expect(tag).not.toMatch(/entryPoint/)
  })
})
