import { describe, expect, it } from 'vitest'
import { docHasNewWorldBlocks, newWorldLiveFrom, planPriceLabel, readNewWorldLive, type NewWorldLiveInput } from './new-world-live'
import type { MembershipTier } from '@/lib/spaces/memberships'
import type { CommerceProduct } from '@/lib/commerce/types'

// LIVE-2053: the New World plans, shop and posts blocks read the Space's own rows. Pure mapping, no IO.

const tier = (o: Partial<MembershipTier>): MembershipTier => ({ id: 't1', name: 'Member', priceCents: 2400, interval: 'month', annualPriceCents: null, description: null, benefits: [], capacity: null, waitlist: false, sort: 0, isActive: true, ...o })
const product = (o: Partial<CommerceProduct>): CommerceProduct => ({ id: 'p1', ownerKind: 'space', ownerProfileId: null, ownerSpaceId: 's1', entityId: 'e', productKind: 'product', vertical: 'general', title: 'Tote', description: 'Heavy canvas', images: ['https://cdn/x.jpg'], priceCents: 1800, currency: 'usd', stock: null, category: 'Merch', status: 'active', bookingSpaceId: null, journeyPlanId: null, condition: null, marketPublished: false, tags: [], metadata: {}, isDemo: false, ...o } as CommerceProduct)
const on = { memberships: true, shop: true, journeys: true, practices: true }
const input = (o: Partial<NewWorldLiveInput>): NewWorldLiveInput => ({ slug: 'danieltyack', switches: on, tiers: [], products: [], practices: null, ...o })

describe('newWorldLiveFrom', () => {
  it('turns membership tiers into plan cards with a printed price, the top tier featured when there is more than one', () => {
    const live = newWorldLiveFrom(input({ tiers: [tier({}), tier({ id: 't2', name: 'Supporter', priceCents: 0, benefits: ['Keeps the room booked', 'A thank-you'] })] }))
    expect(live.plans.on).toBe(true)
    expect(live.plans.rows.map((r) => [r.name, r.price, r.featured, r.href])).toEqual([
      ['Member', '$24 / mo', true, '/spaces/danieltyack/memberships'],
      ['Supporter', 'Free', false, '/spaces/danieltyack/memberships'],
    ])
    expect(live.plans.rows[1].body).toBe('Keeps the room booked · A thank-you')
  })

  it('leaves a lone tier unfeatured and drops inactive tiers', () => {
    const live = newWorldLiveFrom(input({ tiers: [tier({}), tier({ id: 'off', isActive: false })] }))
    expect(live.plans.rows).toHaveLength(1)
    expect(live.plans.rows[0].featured).toBe(false)
  })

  it('turns active products into shop cards that open the Market listing, skipping journeys sold as products', () => {
    const live = newWorldLiveFrom(input({ products: [product({}), product({ id: 'j', productKind: 'journey' }), product({ id: 'd', status: 'draft' })] }))
    expect(live.shop.rows).toEqual([{ id: 'p1', name: 'Tote', body: 'Heavy canvas', price: '$18', meta: 'Merch', href: '/market/p1', image: 'https://cdn/x.jpg', featured: false }])
  })

  it('turns journeys and practices into post rows, journeys first, with the kind as the small line', () => {
    const live = newWorldLiveFrom(input({ practices: { journeys: [{ kind: 'journey', id: 'j1', slug: 'first-month', title: 'Your first month', summary: 'Four weeks in.', emoji: null, adoptCount: 12 }], practices: [{ kind: 'practice', id: 'pr1', slug: 'breathe', title: 'Breathe', summary: null, emoji: null, adoptCount: 0 }] } }))
    expect(live.posts.rows.map((r) => [r.name, r.meta, r.href])).toEqual([
      ['Your first month', '12 on it', '/journeys/first-month'],
      ['Breathe', 'Practice', '/practices/pr1'],
    ])
  })

  it('reports a switched-off function as off with no rows, whatever the Space holds', () => {
    const live = newWorldLiveFrom(input({ switches: { memberships: false, shop: false, journeys: false, practices: false }, tiers: [tier({})], products: [product({})], practices: { journeys: [], practices: [] } }))
    expect(live.plans).toEqual({ on: false, rows: [] })
    expect(live.shop).toEqual({ on: false, rows: [] })
    expect(live.posts).toEqual({ on: false, rows: [] })
  })
})

describe('planPriceLabel', () => {
  it('prints Free, a monthly and a yearly price', () => {
    expect(planPriceLabel({ priceCents: 0, interval: 'month' })).toBe('Free')
    expect(planPriceLabel({ priceCents: 2400, interval: 'month' })).toBe('$24 / mo')
    expect(planPriceLabel({ priceCents: 20000, interval: 'year' })).toBe('$200 / yr')
    expect(planPriceLabel({ priceCents: 5000, interval: 'once' })).toBe('$50')
  })
})

describe('readNewWorldLive and docHasNewWorldBlocks', () => {
  it('reads only a well-formed bag and finds a New World block in a doc', () => {
    expect(readNewWorldLive(undefined)).toBeNull()
    expect(readNewWorldLive({ newWorld: { plans: { on: true } } })).toBeNull()
    const bag = newWorldLiveFrom(input({}))
    expect(readNewWorldLive({ newWorld: bag })).toEqual(bag)
    expect(docHasNewWorldBlocks({ content: [{ type: 'NewWorldPlans', props: {} }] })).toBe(true)
    expect(docHasNewWorldBlocks({ content: [{ type: 'ServicesPlans', props: {} }] })).toBe(false)
  })
})
