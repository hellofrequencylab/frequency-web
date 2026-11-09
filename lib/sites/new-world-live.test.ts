import { describe, expect, it } from 'vitest'
import { docHasNewWorldBlocks, docHasNewWorldWall, newWorldLiveFrom, planPriceLabel, readNewWorldLive, wallPostsFrom, type NewWorldLiveInput, type NewWorldWallSource } from './new-world-live'
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

// LIVE-2108: the community wall block reads the rows an anonymous reader gets from space_wall_feed.
describe('wallPostsFrom', () => {
  const src = (o: Partial<NewWorldWallSource>): NewWorldWallSource => ({ id: 'p1', body: 'Hello wall', post_type: 'feed', created_at: '2026-11-02T18:00:00Z', reaction_count: 14, comment_count: 3, author: { display_name: 'Maya Torres' }, ...o })

  it('shapes the newest three posts with words, names the team on an announcement and prints the counts', () => {
    const wall = wallPostsFrom([src({ post_type: 'announcement' }), src({ id: 'p2', body: '  ', reaction_count: 0 }), src({ id: 'p3', reaction_count: 1, comment_count: 1, author: null }), src({ id: 'p4', reaction_count: 0, comment_count: 0 }), src({ id: 'p5' })], 'danieltyack')
    expect(wall.on).toBe(true)
    expect(wall.href).toBe('/spaces/danieltyack/community')
    expect(wall.rows.map((r) => [r.id, r.name, r.role, r.meta, r.announcement])).toEqual([
      ['p1', 'Maya Torres', 'From the team', '14 high fives · 3 replies', true],
      ['p3', 'A member', 'Member', '1 high five · 1 reply', false],
      ['p4', 'Maya Torres', 'Member', '', false],
    ])
    expect(wall.rows[0].date).toMatch(/^Nov [12]$/)
  })

  it('is off when the read failed or nobody outside may read the wall', () => {
    expect(wallPostsFrom(null, 'x')).toEqual({ on: false, href: '/spaces/x/community', rows: [] })
    expect(wallPostsFrom([], null)).toEqual({ on: false, href: null, rows: [] })
    expect(wallPostsFrom([src({ body: null })], 'x').on).toBe(false)
  })

  it('only reads the wall for a page that draws the wall block, and carries the wall through the bag', () => {
    expect(docHasNewWorldWall({ content: [{ type: 'NewWorldSpaceWall', props: {} }] })).toBe(true)
    expect(docHasNewWorldWall({ content: [{ type: 'NewWorldReviews', props: {} }] })).toBe(false)
    const lists = { plans: { on: true, rows: [] }, shop: { on: true, rows: [] }, posts: { on: true, rows: [] } }
    expect(readNewWorldLive({ newWorld: lists })?.wall).toBeUndefined()
    expect(readNewWorldLive({ newWorld: { ...lists, wall: { on: true, href: '/spaces/x/community', rows: [] } } })?.wall).toEqual({ on: true, href: '/spaces/x/community', rows: [] })
  })
})
