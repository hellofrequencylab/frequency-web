import { describe, it, expect, beforeEach, vi } from 'vitest'

// listLiveOffers and getPartnerView must agree on "live": active, partner active, and not past
// valid_until (scan2 L9-04). The admin client is a recording stub that hands back canned rows.

const h = vi.hoisted(() => {
  const state = {
    calls: [] as Array<[string, unknown[]]>,
    offers: [] as unknown[],
    redemptions: [] as unknown[],
    partner: { id: 'p1', slug: 'blue-cafe', name: 'Blue Cafe', category: null, city: 'Lisbon', description: null, address: null, website: null } as unknown,
  }
  const builder = (table: string): unknown => {
    const c: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'order', 'limit']) {
      c[m] = (...args: unknown[]) => {
        state.calls.push([`${table}.${m}`, args])
        return c
      }
    }
    c.maybeSingle = async () => ({ data: table === 'partners' ? state.partner : null, error: null })
    c.then = (resolve: (v: unknown) => void) =>
      resolve({ data: table === 'partner_offers' ? state.offers : table === 'partner_redemptions' ? state.redemptions : [], error: null })
    return c
  }
  return { state, admin: { from: (table: string) => builder(table) } }
})

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => h.admin }))

import { listLiveOffers, getPartnerView } from './read'

const FUTURE = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString()
const PAST = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()
const partners = { slug: 'blue-cafe', name: 'Blue Cafe', city: 'Lisbon', status: 'active' }

function offer(over: Record<string, unknown>) {
  return { id: 'o', title: 'Offer', description: null, member_terms: null, valid_until: null, active: true, partner_id: 'p1', partners, ...over }
}

describe('listLiveOffers', () => {
  beforeEach(() => {
    h.state.calls = []
    h.state.offers = []
    h.state.redemptions = []
  })

  it('asks the database for active offers only', async () => {
    await listLiveOffers(null)
    expect(h.state.calls.find((c) => c[0] === 'partner_offers.eq')?.[1]).toEqual(['active', true])
  })

  it('drops expired offers, inactive partners, and anything not active, keeping the rest', async () => {
    h.state.offers = [
      offer({ id: 'live-open' }),
      offer({ id: 'live-dated', valid_until: FUTURE }),
      offer({ id: 'expired', valid_until: PAST }),
      offer({ id: 'off', active: false }),
      offer({ id: 'partner-paused', partners: { ...partners, status: 'paused' } }),
    ]
    const live = await listLiveOffers(null)
    expect(live.map((o) => o.id)).toEqual(['live-open', 'live-dated'])
    expect(live[0].partner).toEqual({ slug: 'blue-cafe', name: 'Blue Cafe', city: 'Lisbon' })
  })

  it('merges the viewer redemptions, by offer and by partner for a null-offer redemption', async () => {
    h.state.offers = [offer({ id: 'a' }), offer({ id: 'b', partner_id: 'p2' })]
    h.state.redemptions = [
      { offer_id: 'a', partner_id: 'p1', redeemed_at: '2026-09-01T00:00:00.000Z' },
      { offer_id: null, partner_id: 'p2', redeemed_at: '2026-09-02T00:00:00.000Z' },
    ]
    const live = await listLiveOffers('me')
    expect(live.map((o) => o.redeemedAt)).toEqual(['2026-09-01T00:00:00.000Z', '2026-09-02T00:00:00.000Z'])
  })
})

describe('getPartnerView', () => {
  beforeEach(() => {
    h.state.calls = []
    h.state.offers = []
  })

  it('shows only live offers on the partner page', async () => {
    h.state.offers = [offer({ id: 'live' }), offer({ id: 'expired', valid_until: PAST })]
    const view = await getPartnerView('blue-cafe')
    expect(view?.offers.map((o) => o.id)).toEqual(['live'])
  })
})
