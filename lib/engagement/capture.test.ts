import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Partner-plaque attribution (scan2 L9-04): a redemption names an offer only when the partner has
// exactly ONE live offer. Zero or several leave offer_id null. Everything around the partner step
// (verification, ledger, zaps, trust) is stubbed to its happy path.

const h = vi.hoisted(() => {
  const state = {
    offers: [] as Array<{ id: string; title: string; valid_until: string | null; active: boolean }>,
    inserts: [] as Array<[string, unknown]>,
    node: null as Record<string, unknown> | null,
    rpcCalls: [] as Array<[string, Record<string, unknown>]>,
    rpcAnswer: null as { data: unknown; error: { code?: string; message?: string } | null } | null,
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
        ? {
            data: state.node ?? { type: 'qr', zaps_value: 0, partner_id: 'partner-1', kind: 'plaque', space_id: null },
            error: null,
          }
        : { data: null, error: null }
    c.then = (resolve: (v: unknown) => void) =>
      resolve({ data: table === 'partner_offers' ? state.offers : null, error: null })
    return c
  }
  const rpc = async (name: string, args: Record<string, unknown>) => {
    state.rpcCalls.push([name, args])
    if (!state.rpcAnswer) throw new Error(`unexpected rpc ${name}`)
    return state.rpcAnswer
  }
  return { state, admin: { from: (table: string) => builder(table), rpc } }
})

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => h.admin }))
vi.mock('./verify', () => ({ verifyCapture: vi.fn(async () => ({ ok: true })) }))
vi.mock('./events', () => ({
  recordEngagementEvent: vi.fn(async () => ({ recorded: true, id: 'ev-1' })),
  runEngagementAutomations: vi.fn(async () => {}),
}))
vi.mock('@/lib/zaps', () => ({ awardZaps: vi.fn() }))
vi.mock('@/lib/trust', () => ({ trustSource: () => ({ signal: async () => {} }) }))
vi.mock('@/lib/crm/interactions', () => ({ recordSpaceMemberActivity: vi.fn() }))
vi.mock('@/lib/loyalty/visit', () => ({ recordLoyaltyVisit: vi.fn(async () => ({ outcome: null, zapsAwarded: 0 })) }))
vi.mock('@/lib/loyalty/hunts-visit', () => ({ recordHuntProgress: vi.fn(async () => ({ hunts: [], zapsAwarded: 0 })) }))

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


// NFC + QR unification: one check-in node is reached by a printed QR and a tapped placard, so the
// medium the member used decides the ledger source and is stored on the row; the node type
// (here 'qr') is only the fallback.
import { recordEngagementEvent } from './events'

describe('captureNode medium', () => {
  beforeEach(() => {
    h.state.offers = []
    h.state.inserts = []
    vi.mocked(recordEngagementEvent).mockClear()
  })
  const ledger = () =>
    vi.mocked(recordEngagementEvent).mock.calls.find((c) => c[0].eventType === 'node_capture')?.[0]

  it('falls back to the node type when the medium is unknown', async () => {
    await captureNode(attempt)
    expect(ledger()).toMatchObject({ source: 'qr', context: { nodeId: 'node-1', medium: 'qr' } })
  })
  it('records a placard tap on a QR-type node as NFC', async () => {
    await captureNode({ ...attempt, medium: 'nfc' })
    expect(ledger()).toMatchObject({ source: 'nfc', context: { medium: 'nfc' } })
  })
  it('records a counter scanner card as an NFC read with the device medium', async () => {
    await captureNode({ ...attempt, medium: 'device' })
    expect(ledger()).toMatchObject({ source: 'nfc', context: { medium: 'device' } })
  })
})

// A Space check-in is presence, not a practice (LIVE-1271): it must not emit practice.verified, which
// fires the "Nice work! You just logged a practice" automation email. Other captures still do.
describe('captureNode practice event', () => {
  beforeEach(() => {
    h.state.offers = []
    h.state.inserts = []
    vi.mocked(recordEngagementEvent).mockClear()
  })
  afterEach(() => {
    h.state.node = null
  })
  const practice = () => vi.mocked(recordEngagementEvent).mock.calls.find((c) => c[0].eventType === 'practice.verified')

  it('does not emit practice.verified for a Space check-in node', async () => {
    h.state.node = { type: 'qr', zaps_value: 0, partner_id: null, kind: 'checkin', space_id: 'space-1' }
    await captureNode({ ...attempt, medium: 'nfc' })
    expect(practice()).toBeUndefined()
  })
  it('still emits practice.verified for an ordinary non-partner node', async () => {
    h.state.node = { type: 'qr', zaps_value: 0, partner_id: null, kind: 'ghost', space_id: null }
    await captureNode(attempt)
    expect(practice()).toBeDefined()
  })
})

// FH-002S: a capped node ("first N win") claims its unit through node_capture_claim, which counts and
// writes under the node row lock. An uncapped node never calls it. Until the migration is applied the
// function is missing, and the capture falls back to the path that shipped before it.
import { runEngagementAutomations } from './events'
import { awardZaps } from '@/lib/zaps'

describe('captureNode capped claim', () => {
  const capped = { type: 'qr', zaps_value: 5, partner_id: null, kind: 'standard', space_id: null, capture_rule: 'once_per_user', max_claims: 1 }
  beforeEach(() => {
    h.state.offers = []
    h.state.inserts = []
    h.state.rpcCalls = []
    h.state.rpcAnswer = null
    h.state.node = capped
    vi.mocked(recordEngagementEvent).mockClear()
    vi.mocked(runEngagementAutomations).mockClear()
    vi.mocked(awardZaps).mockClear()
  })
  afterEach(() => {
    h.state.node = null
    h.state.rpcAnswer = null
  })
  const ledgerWrites = () => vi.mocked(recordEngagementEvent).mock.calls.filter((c) => c[0].eventType === 'node_capture')
  const captureInserts = () => h.state.inserts.filter((i) => i[0] === 'captures')

  it('claims the unit in the database and writes neither row itself', async () => {
    h.state.rpcAnswer = { data: { result: 'claimed', event_id: 'ev-claim' }, error: null }
    const r = await captureNode({ ...attempt, medium: 'nfc' })
    expect(r).toMatchObject({ ok: true, zapsAwarded: 5 })
    expect(h.state.rpcCalls).toEqual([
      ['node_capture_claim', {
        p_node_id: 'node-1',
        p_actor: 'me',
        p_idempotency_key: 'node:node-1:me',
        p_source: 'nfc',
        p_context: { nodeId: 'node-1', medium: 'nfc', spaceId: null },
      }],
    ])
    expect(ledgerWrites()).toHaveLength(0)
    expect(captureInserts()).toHaveLength(0)
    expect(runEngagementAutomations).toHaveBeenCalledWith('node_capture', 'me', 'nfc', { nodeId: 'node-1', medium: 'nfc', spaceId: null })
    expect(awardZaps).toHaveBeenCalledTimes(1)
  })

  it('refuses the member who lost the last unit with the cap-reached outcome and pays nothing', async () => {
    h.state.rpcAnswer = { data: { result: 'capacity_reached' }, error: null }
    expect(await captureNode(attempt)).toEqual({ ok: false, reason: 'capacity_reached' })
    expect(ledgerWrites()).toHaveLength(0)
    expect(captureInserts()).toHaveLength(0)
    expect(runEngagementAutomations).not.toHaveBeenCalled()
    expect(awardZaps).not.toHaveBeenCalled()
  })

  it('answers a replay by the same member as already captured and pays nothing', async () => {
    h.state.rpcAnswer = { data: { result: 'already_captured' }, error: null }
    expect(await captureNode(attempt)).toEqual({ ok: false, reason: 'already_captured' })
    expect(captureInserts()).toHaveLength(0)
    expect(awardZaps).not.toHaveBeenCalled()
  })

  it.each(['PGRST202', '42883'])('falls back to the earlier path when the function is not applied yet (%s)', async (code) => {
    h.state.rpcAnswer = { data: null, error: { code, message: 'function not found' } }
    const r = await captureNode(attempt)
    expect(r).toMatchObject({ ok: true, zapsAwarded: 5 })
    expect(ledgerWrites()).toHaveLength(1)
    expect(ledgerWrites()[0][0]).toMatchObject({ idempotencyKey: 'node:node-1:me', source: 'qr' })
    expect(captureInserts()).toEqual([['captures', { node_id: 'node-1', actor_profile_id: 'me', verified: true }]])
    expect(runEngagementAutomations).not.toHaveBeenCalled()
    expect(awardZaps).toHaveBeenCalledTimes(1)
  })

  it('throws on any other claim failure instead of paying on a guess', async () => {
    h.state.rpcAnswer = { data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } }
    await expect(captureNode(attempt)).rejects.toMatchObject({ code: '57014' })
    expect(ledgerWrites()).toHaveLength(0)
    expect(captureInserts()).toHaveLength(0)
    expect(awardZaps).not.toHaveBeenCalled()
  })

  it.each([null, 0, undefined])('never calls the claim for an uncapped node (max_claims %s)', async (maxClaims) => {
    h.state.node = { ...capped, max_claims: maxClaims }
    const r = await captureNode(attempt)
    expect(r).toMatchObject({ ok: true })
    expect(h.state.rpcCalls).toHaveLength(0)
    expect(ledgerWrites()).toHaveLength(1)
    expect(captureInserts()).toHaveLength(1)
  })
})
