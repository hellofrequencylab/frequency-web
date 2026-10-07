import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// ─────────────────────────────────────────────────────────────────────────────────────────────
// A FREE MEMBER LISTS, AND NEVER TAKES MONEY (ADR-1709, LIVE-753, superseding ADR-914).
//
// ADR-914 opened selling on every tier. ADR-1709 closed it again on the other axis: listing stays
// open to any signed-in member (an INQUIRY, the buyer messages the maker), but taking payment is
// what a Business Space is for. Personal selling is off on every personal tier, and a free Space
// below Business is refused at the payments gate. Tips stay open at 0%.
//
// What must NOT come back is the old wall: no `isPaid` page, no `redirect('/upgrade')` in the create
// action. A member never loses their listing behind a paywall; the upgrade moment sits beside the
// price instead (LIVE-758). The real page and action run with a genuinely free profile, and the
// assertions are what they DID; a grep-shaped guard rides along at the bottom.
//
// The rate half is now default-deny: the personal rungs (memberFree 1000, Crew 800) stay in code
// only so a mis-routed sale could never price at 0%, and the refusal is what the tests assert.
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
// The page resolves the maker's Connect prompt (LIVE-537); that is two admin reads and not this file's
// subject. lib/billing/connect-prompt.test.tsx pins the seam.
vi.mock('@/lib/pricing/business-offer', () => ({
  loadUpgradeOffer: vi.fn().mockResolvedValue({ sellable: false, trialDays: 14, monthlyCents: null }),
}))
vi.mock('@/lib/billing/payout-prompt-resolve', () => ({ resolveProfilePayoutPrompt: vi.fn().mockResolvedValue(null) }))
// The governed create layer (ADR-988, ADR-1249) has its own test; here the commit passes straight
// through so the assertion stays "createProduct was called for a free member". The layer's real
// refusals are not what this file measures.
vi.mock('@/lib/ai/vera/create-entity', () => ({
  proposeAndConfirmCreate: async ({ commit }: { commit: (input: unknown) => Promise<unknown> }) => {
    try {
      return { data: await commit({ entity: 'product', draft: {}, actorProfileId: 'p1', spaceId: null, proposalId: 'a1' }) }
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'failed' }
    }
  },
}))

import { createMakerProductAction, draftMakerProductCopyAction } from './commerce-actions'
import MarketSellPage from '../market/sell/page'
import { ProductSpark } from '../market/sell/product-spark'
import {
  memberNetworkTakeRateBps,
  sourceAwareMemberTakeRateCents,
  NETWORK_TAKE_RATE_DEFAULT,
} from '@/lib/billing/pricing-keys'
import { FEATURE_GATES } from '@/lib/pricing/gates'
import { canTakePayments } from '@/lib/commerce/selling'
import { planTakesPayments, personalPaymentsRefusal } from '@/lib/pricing/payments-gate'

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

describe('the list-a-product page lets a free member in (listing stays open, ADR-1709)', () => {
  it('renders the Spark for a free member, not an upgrade wall', async () => {
    const el = await MarketSellPage()
    expect(el).toEqual(expect.objectContaining({ type: ProductSpark }))
    expect(redirect).not.toHaveBeenCalled()
  })

  it('renders the same Spark for a Crew member (Crew changes neither the door nor the money)', async () => {
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

describe('createMakerProductAction lets a free member list an inquiry (ADR-1709)', () => {
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

describe('the Spark Vera door answers a free member', () => {
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

describe('a free Member and a free Space are REFUSED, not priced (LIVE-753)', () => {
  it('refuses every personal seller at the owner-kind gate', () => {
    expect(canTakePayments('profile')).toBe(false)
    expect(canTakePayments('space')).toBe(true) // the Space still has to clear its plan
    const verdict = personalPaymentsRefusal()
    expect(verdict.ok).toBe(false)
    if (!verdict.ok) expect(verdict.refusal).toMatchObject({ code: 'payments_plan', scope: 'personal', spaceId: null })
  })

  it('refuses a free Space at the payments gate and admits Business and up', () => {
    expect(planTakesPayments('free')).toBe(false)
    expect(planTakesPayments(null)).toBe(false)
    for (const plan of ['business', 'collective', 'nonprofit', 'nonprofit_collective', 'independent']) {
      expect(planTakesPayments(plan), plan).toBe(true)
    }
  })

  it('keeps the personal rungs only as default-deny values, never 0%', () => {
    // Unreachable for a sale now; if anything ever routed one here it must not price at 0%.
    expect(NETWORK_TAKE_RATE_DEFAULT.memberFree).toBe(1000)
    expect(memberNetworkTakeRateBps('free')).toBe(1000)
    expect(memberNetworkTakeRateBps('crewe')).toBe(1000)
    expect(sourceAwareMemberTakeRateCents(2800, 'network', NETWORK_TAKE_RATE_DEFAULT, 'free')).toBe(280)
    // The hard promise survives: a sale to the seller's own audience is 0% on every tier.
    expect(sourceAwareMemberTakeRateCents(2800, 'self', NETWORK_TAKE_RATE_DEFAULT, 'free')).toBe(0)
  })
})

describe('the Crew feature gates that remain are untouched (the repeat stays gated)', () => {
  it('keeps every one of them on the crew floor and enabled', () => {
    // This named five until HYG-079 deleted `journey_library_list` and `entry_points`, then three
    // until ADR-1295 (owner ruling 2026-09-09, OWN-071) deleted `gamification_full` and
    // `vault_cash_in` with their call sites: the Quest is a side thing we all do together, so
    // earning, spending and competing are open to every signed-in member.
    //
    // ONE personal gate is left, and it is the one with a real marginal cost per user rather than a
    // game rung: every Vera request is inference spend with no natural ceiling.
    for (const key of ['vera_unlimited']) {
      expect(FEATURE_GATES[key], key).toEqual({ axis: 'tier', minEntitlement: 'crew', enabled: true })
    }
    for (const key of ['gamification_full', 'vault_cash_in']) {
      expect(FEATURE_GATES, key).not.toHaveProperty(key)
    }
  })

  it('does not re-add a personal selling gate to FEATURE_GATES (personal selling is off by owner kind)', () => {
    for (const key of Object.keys(FEATURE_GATES)) {
      expect(key).not.toMatch(/market_sell|maker_sell|event_paid_tickets|personal_payouts/)
    }
    // The one money gate is on the PLAN axis, at Business.
    expect(FEATURE_GATES.space_payments).toEqual({ axis: 'plan', minEntitlement: 'business', enabled: true })
  })
})

// The weaker, second net: the exact idiom must not reappear in either file. On its own this proves
// nothing (a wall could be spelled differently), which is why the behavioural tests above come first.
describe('source shape: neither Market listing surface walls a member behind a paid tier', () => {
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
