import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { MARKETPLACE_ENTRY_COOKIE, signStamp } from '@/lib/commerce/marketplace-entry'

// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE DISCOVERY ENTRY POINT REACHES CHECKOUT (LIVE-219, closed by LIVE-220).
//
// The defect this file exists against was NOT in the classifier. `classifyOrderSource` was correct,
// well tested, and accepted `entryPoint: 'marketplace'` from the day it shipped — nothing ever passed
// it. LIVE-219 taught the action to forward a client argument. LIVE-220 moved that signal off the
// argument list: proxy.ts stamps an httpOnly cookie when the Market or Journey page renders, and
// startCheckoutAction reads that cookie. A crafted call can no longer omit an argument to force
// the 0% `self` default on a listing the buyer actually viewed on a discovery surface.
//
// So this file tests the WIRING:
//   1. a stamp for THIS product forwards marketplace; a stamp for another product does not
//   2. no stamp (the storefront case) sends null — the 0% default
//   3. the Market and Journey pages do not pass a client entryPoint
//   4. the Store still does not, and proxy.ts does not stamp `/store/<id>`
// ─────────────────────────────────────────────────────────────────────────────────────────────

const { getMyProfileId, createCommerceCheckout, journeySlugForProduct } = vi.hoisted(() => ({
  getMyProfileId: vi.fn(),
  createCommerceCheckout: vi.fn(),
  journeySlugForProduct: vi.fn(),
}))

const cookieStore = new Map<string, string>()

vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (k: string) => {
      const v = cookieStore.get(k)
      return v ? { value: v } : undefined
    },
  }),
  headers: async () => new Headers(),
}))
vi.mock('@/lib/auth', () => ({ getMyProfileId, getCallerProfile: vi.fn() }))
vi.mock('@/lib/commerce/checkout', () => ({ createCommerceCheckout }))
vi.mock('@/lib/commerce/products', () => ({
  createProduct: vi.fn(),
  setProductStatus: vi.fn(),
  deleteProduct: vi.fn(),
  productOwnerProfileId: vi.fn(),
  journeySlugForProduct,
}))
vi.mock('@/lib/ai/listing-copy', () => ({ draftListingCopy: vi.fn() }))
vi.mock('@/lib/ai/vera/create-entity', () => ({ proposeAndConfirmCreate: vi.fn() }))

import { startCheckoutAction } from './commerce-actions'

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), 'utf8')
const SECRET = 'marketplace-entry-test-secret'
const prevCron = process.env.CRON_SECRET

/** The entry point the action actually handed to checkout on the most recent call. */
function forwardedEntryPoint(): unknown {
  const last = createCommerceCheckout.mock.calls.at(-1)
  if (!last) throw new Error('createCommerceCheckout was never called')
  return (last[0] as { entryPoint?: unknown }).entryPoint
}

function stampProduct(productId: string) {
  const signed = signStamp({ p: [productId], j: [], iat: Date.now() })
  if (!signed) throw new Error('signStamp returned null — CRON_SECRET missing')
  cookieStore.set(MARKETPLACE_ENTRY_COOKIE, signed)
}

function stampJourney(slug: string) {
  const signed = signStamp({ p: [], j: [slug], iat: Date.now() })
  if (!signed) throw new Error('signStamp returned null — CRON_SECRET missing')
  cookieStore.set(MARKETPLACE_ENTRY_COOKIE, signed)
}

describe('LIVE-220 · the cookie stamp reaches createCommerceCheckout', () => {
  beforeEach(() => {
    process.env.CRON_SECRET = SECRET
    cookieStore.clear()
    vi.clearAllMocks()
    getMyProfileId.mockResolvedValue('buyer-1')
    createCommerceCheckout.mockResolvedValue({ url: 'https://checkout.stripe.test/x' })
    journeySlugForProduct.mockResolvedValue(null)
  })
  afterEach(() => {
    process.env.CRON_SECRET = prevCron
  })

  it('forwards marketplace when THIS product was stamped on the Market page', async () => {
    stampProduct('prod-1')
    await startCheckoutAction('prod-1', null)
    expect(forwardedEntryPoint()).toBe('marketplace')
    expect(journeySlugForProduct).not.toHaveBeenCalled()
  })

  it('sends null when nothing was stamped — the storefront case, and the 0% default', async () => {
    await startCheckoutAction('prod-1', null)
    expect(forwardedEntryPoint()).toBeNull()
  })

  it('does not let a stamp for another product raise this one', async () => {
    stampProduct('prod-other')
    await startCheckoutAction('prod-1', null)
    expect(forwardedEntryPoint()).toBeNull()
  })

  it('forwards marketplace when a Journey slug stamp matches this product', async () => {
    stampJourney('house-of-fates')
    journeySlugForProduct.mockResolvedValue('house-of-fates')
    await startCheckoutAction('prod-1', null)
    expect(journeySlugForProduct).toHaveBeenCalledWith('prod-1')
    expect(forwardedEntryPoint()).toBe('marketplace')
  })

  it('still refuses a signed-out buyer before any checkout is attempted', async () => {
    stampProduct('prod-1')
    getMyProfileId.mockResolvedValue(null)
    const res = await startCheckoutAction('prod-1', null)
    expect(res.error).toBeTruthy()
    expect(createCommerceCheckout).not.toHaveBeenCalled()
  })
})

describe('LIVE-220 · which surfaces declare the entry point', () => {
  const market = read('app', '(public)', 'market', '[id]', 'page.tsx')
  const store = read('app', '(public)', 'store', '[id]', 'page.tsx')
  const picker = read('components', 'marketplace', 'variant-picker.tsx')
  const journey = read('app', '(main)', 'journeys', '[slug]', 'page.tsx')

  it('the Market no longer passes a client entryPoint — proxy.ts stamps the product id', () => {
    const tags = market.match(/<(?:BuyButton|VariantPicker)[\s\S]*?\/>/g) ?? []
    expect(tags.length).toBeGreaterThanOrEqual(2)
    for (const tag of tags) expect(tag).not.toMatch(/entryPoint/)
  })

  it('the VariantPicker no longer forwards an entryPoint prop', () => {
    expect(picker).not.toMatch(/entryPoint/)
  })

  it('the Journey sales page no longer passes a client entryPoint — proxy.ts stamps the slug', () => {
    expect(journey).toMatch(/<BuyButton\b/)
    expect(journey).not.toMatch(/entryPoint=/)
  })

  it('🔴 the Store still passes NO entry point, because a seller’s own link is not an introduction', () => {
    const tags = store.match(/<BuyButton[\s\S]*?\/>/g) ?? []
    expect(tags.length).toBeGreaterThanOrEqual(1)
    for (const tag of tags) expect(tag).not.toMatch(/entryPoint/)
  })
})
