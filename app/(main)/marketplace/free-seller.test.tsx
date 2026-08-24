import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE MARKET IS OPEN ON THE FREE TIER (ADR-914, owner ruling 2026-08-24).
//
// ADR-914 reversed ADR-913 the same day: a free Member sells on day one, no upgrade, and the paid
// rungs buy the RATE down instead of buying the permission. The Market kept two hand-rolled
// `isPaid(profile.realMembershipTier)` walls anyway — a "Selling is a paid feature" page and a
// `redirect('/upgrade')` in the create action — plus a third on the Spark's Vera door. All three are
// gone, and this file is what makes their return fail.
//
// It exercises the GATE DECISION, not the absence of a line: the real page function and the real
// server action run, with a genuinely free-tier profile, and the assertion is what they DID (rendered
// the Spark / called createProduct / drafted copy). A grep-shaped guard rides along at the bottom as a
// second, weaker net, because it names the exact idiom that must not reappear.
//
// The other half of the ruling is asserted too: the five Crew feature gates are untouched, and a free
// seller's network-sourced sale settles at the `memberFree` rung (1000bps, 10%) rather than 0% or the
// Crew rung. A wall removed while the rate quietly resolved to 0% would give the product away.
// ─────────────────────────────────────────────────────────────────────────────────────────────

const { getCallerProfile, createProduct, setProductStatus, draftListingCopy, redirect } = vi.hoisted(() => ({
  getCallerProfile: vi.fn(),
  createProduct: vi.fn(),
  setProductStatus: vi.fn(),
  draftListingCopy: vi.fn(),
  // `redirect` throws in Next so control never returns past it; the sentinel lets a test say WHERE.
  redirect: vi.fn((href: string) => {
    throw new Error(`REDIRECT:${href}`)
  }),
}))

vi.mock('next/navigation', () => ({ redirect }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getCallerProfile, getMyProfileId: vi.fn() }))
vi.mock('@/lib/commerce/products', () => ({
  createProduct,
  setProductStatus,
  deleteProduct: vi.fn(),
  productOwnerProfileId: vi.fn(),
}))
// Cut the Stripe import chain: buying is not what this file is about.
vi.mock('@/lib/commerce/checkout', () => ({ createCommerceCheckout: vi.fn() }))
vi.mock('@/lib/ai/listing-copy', () => ({ draftListingCopy }))
// The Spark is a client island; the page test only cares that the page CHOSE to render it.
vi.mock('./../market/sell/product-spark', () => ({ ProductSpark: () => null }))

import { createMakerProductAction, draftMakerProductCopyAction } from './commerce-actions'
import MarketSellPage from '../market/sell/page'
import { ProductSpark } from '../market/sell/product-spark'
import {
  memberNetworkTakeRateBps,
  sourceAwareMemberTakeRateCents,
  NETWORK_TAKE_RATE_DEFAULT,
} from '@/lib/billing/pricing-keys'
import { FEATURE_GATES } from '@/lib/pricing/gates'

/** A genuinely free member: `membership_tier = 'free'` on the REAL (never beta-overridden) field. */
const freeMember = { id: 'profile-free', membershipTier: 'free', realMembershipTier: 'free' }
const crewMember = { id: 'profile-crew', membershipTier: 'crew', realMembershipTier: 'crew' }

function listingForm(): FormData {
  const fd = new FormData()
  fd.set('title', 'Hand-thrown ceramic mug')
  fd.set('price', '28')
  fd.set('productKind', 'physical')
  fd.set('condition', 'used')
  return fd
}

/** Run an action that may `redirect`, returning the href it redirected to (or null). */
async function redirectedTo(run: () => Promise<unknown>): Promise<string | null> {
  try {
    await run()
    return null
  } catch (e) {
    const m = /^REDIRECT:(.*)$/.exec((e as Error).message)
    if (!m) throw e
    return m[1]
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  getCallerProfile.mockResolvedValue({ ...freeMember })
  createProduct.mockResolvedValue({ id: 'prod-1' })
  setProductStatus.mockResolvedValue(undefined)
  draftListingCopy.mockResolvedValue({ title: 'Ceramic mug', description: 'A mug.' })
})

describe('the list-a-product page lets a free member in (ADR-914)', () => {
  it('renders the Spark for a free member, not an upgrade wall', async () => {
    const el = await MarketSellPage()
    expect(el).toEqual(expect.objectContaining({ type: ProductSpark }))
    expect(redirect).not.toHaveBeenCalled()
  })

  it('renders the same Spark for a Crew member (paying changes the rate, not the door)', async () => {
    getCallerProfile.mockResolvedValue({ ...crewMember })
    const el = await MarketSellPage()
    expect(el).toEqual(expect.objectContaining({ type: ProductSpark }))
  })

  // The positive control: the ONE thing the page still refuses.
  it('still sends a signed-out visitor to sign in', async () => {
    getCallerProfile.mockResolvedValue(null)
    expect(await redirectedTo(() => MarketSellPage())).toBe('/sign-in?next=/market/sell')
  })
})

describe('createMakerProductAction lets a free member list (ADR-914)', () => {
  it('creates the listing for a free member and never redirects to /upgrade', async () => {
    const to = await redirectedTo(() => createMakerProductAction(listingForm()))
    expect(to).toBe('/market/prod-1') // the success redirect, not the paywall
    expect(createProduct).toHaveBeenCalledWith(
      expect.objectContaining({ ownerKind: 'profile', ownerProfileId: 'profile-free', title: 'Hand-thrown ceramic mug' }),
    )
    expect(setProductStatus).toHaveBeenCalledWith('prod-1', 'active')
    expect(redirect).not.toHaveBeenCalledWith('/upgrade')
  })

  it('still sends a signed-out caller to sign in', async () => {
    getCallerProfile.mockResolvedValue(null)
    expect(await redirectedTo(() => createMakerProductAction(listingForm()))).toBe('/sign-in?next=/market/sell')
    expect(createProduct).not.toHaveBeenCalled()
  })

  // The rules that are NOT about tier and must survive the wall's removal.
  it('keeps the used-only rule for an individual seller (R3)', async () => {
    const fd = listingForm()
    fd.set('condition', 'new')
    expect(await redirectedTo(() => createMakerProductAction(fd))).toBe('/spaces/new')
    expect(createProduct).not.toHaveBeenCalled()
  })
})

describe('the Spark Vera door answers a free member (ADR-914)', () => {
  it('drafts copy for a free member', async () => {
    const copy = await draftMakerProductCopyAction({ productKind: 'physical', seed: 'mug' })
    expect(copy).toEqual({ title: 'Ceramic mug', description: 'A mug.' })
    expect(draftListingCopy).toHaveBeenCalledWith(expect.objectContaining({ profileId: 'profile-free' }))
  })

  it('returns empty copy for a signed-out caller', async () => {
    getCallerProfile.mockResolvedValue(null)
    expect(await draftMakerProductCopyAction({ seed: 'mug' })).toEqual({ title: '', description: '' })
    expect(draftListingCopy).not.toHaveBeenCalled()
  })
})

describe('the rate is the ladder: a free seller settles at the memberFree rung', () => {
  it('prices a free Member network sale at 1000bps (10%), not 0% and not the Crew rung', () => {
    expect(NETWORK_TAKE_RATE_DEFAULT.memberFree).toBe(1000)
    expect(memberNetworkTakeRateBps('free')).toBe(1000)
    expect(memberNetworkTakeRateBps(null)).toBe(1000)
    expect(memberNetworkTakeRateBps('crew')).toBe(800)
    // $28 mug sourced by the network: $2.80 to the platform, floored, never 0.
    expect(sourceAwareMemberTakeRateCents(2800, 'network', NETWORK_TAKE_RATE_DEFAULT, 'free')).toBe(280)
    expect(sourceAwareMemberTakeRateCents(2800, 'network', NETWORK_TAKE_RATE_DEFAULT, 'crew')).toBe(224)
  })

  it('fails toward the HIGHER rung on an unreadable tier (ADR-914), and 0% on the seller own audience', () => {
    // `isPaid` is an allow-list, so a typo prices at free rather than handing out the discount.
    expect(memberNetworkTakeRateBps('crewe')).toBe(1000)
    expect(memberNetworkTakeRateBps(undefined)).toBe(1000)
    // The hard promise: a sale to the seller's own audience is 0% on every tier.
    expect(sourceAwareMemberTakeRateCents(2800, 'self', NETWORK_TAKE_RATE_DEFAULT, 'free')).toBe(0)
  })

  it('holds the free Member rung equal to the free Space rung (a free Space changes nothing)', () => {
    expect(NETWORK_TAKE_RATE_DEFAULT.memberFree).toBe(NETWORK_TAKE_RATE_DEFAULT.free)
  })
})

describe('the five Crew feature gates are untouched (the repeat stays gated)', () => {
  it('keeps every one of them on the crew floor and enabled', () => {
    for (const key of ['journey_library_list', 'entry_points', 'gamification_full', 'vault_cash_in', 'vera_unlimited']) {
      expect(FEATURE_GATES[key], key).toEqual({ axis: 'tier', minEntitlement: 'crew', enabled: true })
    }
  })

  it('does not re-add a Market selling gate to FEATURE_GATES', () => {
    for (const key of Object.keys(FEATURE_GATES)) {
      expect(key).not.toMatch(/market_sell|maker_sell|event_paid_tickets|personal_payouts/)
    }
  })
})

// The weaker, second net: the exact idiom must not reappear in either file. On its own this proves
// nothing (a wall could be spelled differently), which is why the behavioural tests above come first.
describe('source shape: neither Market selling surface reads a paid tier', () => {
  const root = join(__dirname, '..', '..', '..')
  const files = ['app/(main)/market/sell/page.tsx', 'app/(main)/marketplace/commerce-actions.ts']

  it.each(files)('%s has no isPaid gate and no /upgrade redirect', (rel) => {
    const src = readFileSync(join(root, rel), 'utf8')
    // Strip comments: the files DESCRIBE the removed wall on purpose, and prose is not a gate.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
    expect(code).not.toMatch(/\bisPaid\b/)
    expect(code).not.toMatch(/realMembershipTier/)
    expect(code).not.toMatch(/redirect\(\s*['"`]\/upgrade/)
  })
})
