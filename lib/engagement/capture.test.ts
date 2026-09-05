import { describe, it, expect, beforeEach, vi } from 'vitest'

// Partner-plaque attribution (scan2 L9-04): a redemption names an offer only when the partner has
// exactly ONE live offer. Zero or several leave offer_id null. Everything around the partner step
// (verification, ledger, zaps, trust) is stubbed to its happy path.

const h = vi.hoisted(() => {
  const state = {
    offers: [] as Array<{ id: string; title: string; valid_until: string | null; active: boolean }>,
    inserts: [] as Array<[string, unknown]>,
  }
  const builder = (table: string): unknown => {
    const c: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'order', 'limit']) c[m] = () => c
    c.insert = (row: unknown) => {
      state.inserts.push([table, row])
      return c
    }
    c.maybeSingle = async () =>
      table === 'nodes'
        ? { data: { type: 'qr', zaps_value: 0, partner_id: 'partner-1', kind: 'plaque', space_id: null }, error: null }
        : { data: null, error: null }
    c.then = (resolve: (v: unknown) => void) =>
      resolve({ data: table === 'partner_offers' ? state.offers : null, error: null })
    return c
  }
  return { state, admin: { from: (table: string) => builder(table) } }
})

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => h.admin }))
vi.mock('./verify', () => ({ verifyCapture: vi.fn(async () => ({ ok: true })) }))
vi.mock('./events', () => ({ recordEngagementEvent: vi.fn(async () => ({ recorded: true, id: 'ev-1' })) }))
vi.mock('@/lib/zaps', () => ({ awardZaps: vi.fn() }))
vi.mock('@/lib/trust', () => ({ trustSource: () => ({ signal: async () => {} }) }))
vi.mock('@/lib/crm/interactions', () => ({ recordSpaceMemberActivity: vi.fn() }))

import { captureNode } from './capture'

const FUTURE = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString()
const PAST = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()
const attempt = { nodeId: 'node-1', actorProfileId: 'me' }

function redemption() {
  return h.state.inserts.find((i) => i[0] === 'partner_redemptions')?.[1] as { offer_id: string | null; partner_id: string } | undefined
}

describe('captureNode partner attribution', () => {
  beforeEach(() => {
    h.state.offers = []
    h.state.inserts = []
  })

  it('credits the one live offer', async () => {
    h.state.offers = [{ id: 'offer-a', title: 'Free refill', valid_until: FUTURE, active: true }]
    const r = await captureNode(attempt)
    expect(r).toMatchObject({ ok: true, offerTitle: 'Free refill' })
    expect(redemption()).toMatchObject({ partner_id: 'partner-1', offer_id: 'offer-a' })
  })

  it('leaves offer_id null with no live offer, including an expired one', async () => {
    h.state.offers = [{ id: 'offer-old', title: 'Gone', valid_until: PAST, active: true }]
    const r = await captureNode(attempt)
    expect(r).toMatchObject({ ok: true, offerTitle: null })
    expect(redemption()).toMatchObject({ partner_id: 'partner-1', offer_id: null })
  })

  it('leaves offer_id null when several offers are live rather than guessing', async () => {
    h.state.offers = [
      { id: 'offer-a', title: 'A', valid_until: null, active: true },
      { id: 'offer-b', title: 'B', valid_until: FUTURE, active: true },
    ]
    const r = await captureNode(attempt)
    expect(r).toMatchObject({ ok: true, offerTitle: null })
    expect(redemption()).toMatchObject({ offer_id: null })
  })
})
