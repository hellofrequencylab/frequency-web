// FH-046S: the Trail gift mirror against a fake service-role client. The four money states (success,
// abandonment, full refund, partial refund) must show the right settled totals, the ask must stay shut
// without the D8 approval, and no run, claim or progress row may ever change.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, unknown>
let tables: Record<string, Row[]> = {}
const writes: string[] = []
const reads: string[] = []

function builder(table: string) {
  let filter = (r: Row) => !!r
  let patch: Row | null = null
  const q: Record<string, unknown> = {}
  const rows = () => (tables[table] ?? []).filter(filter)
  const run = () => {
    if (patch) for (const r of rows()) Object.assign(r, patch)
    return { data: rows().map((r) => ({ ...r })), error: null }
  }
  Object.assign(q, {
    select: () => { reads.push(table); return q },
    eq: (col: string, val: unknown) => { const prev = filter; filter = (r) => prev(r) && r[col] === val; return q },
    in: (col: string, vals: unknown[]) => { const prev = filter; filter = (r) => prev(r) && vals.includes(r[col]); return q },
    update: (p: Row) => { writes.push(table); patch = p; return q },
    upsert: async (row: Row, opts: { onConflict: string }) => {
      writes.push(table)
      const list = (tables[table] ??= [])
      const hit = list.find((r) => r[opts.onConflict] === row[opts.onConflict])
      if (hit) Object.assign(hit, row)
      else list.push({ id: `g${list.length + 1}`, ...row })
      return { error: null }
    },
    maybeSingle: async () => ({ data: run().data[0] ?? null, error: null }),
    then: (res: (v: unknown) => unknown) => res(run()),
  })
  return q
}

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: (t: string) => builder(t) }) }))
const payee = vi.hoisted(() => ({ canGive: true, fund: { id: 'f1', fundLabel: 'Pantry fund', description: 'Stock the pantry.', suggestedAmountsCents: [500, 2500], isActive: true } as unknown }))
const checkout = vi.hoisted(() => ({ create: vi.fn() }))
vi.mock('@/lib/billing/space-donation-checkout', () => ({
  spaceCanTakeDonations: async () => payee.canGive,
  createSpaceDonationCheckout: checkout.create,
  recordSpaceDonationFromSessionId: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({ getMyProfileId: async () => 'p1' }))
vi.mock('@/lib/billing/stripe-browser', () => ({ onPageCheckoutAvailable: () => true }))
vi.mock('@/lib/rate-limit', () => ({ rateLimitOk: async () => true }))
vi.mock('next/headers', () => ({ headers: async () => new Headers() }))
vi.mock('@/lib/spaces/donations', () => ({ getDonationAsk: async () => payee.fund }))

const ask = { id: 'a1', hunt_id: 'h1', beneficiary_space_id: 's1', enabled: true, approved_at: '2026-11-10T00:00:00Z', approved_by: 'p9', headline: null }
const donation = (id: string, status: string, extra: Row = {}): Row => ({
  id, space_id: 's1', amount_cents: 1000, currency: 'usd', status, succeeded_at: status === 'pending' ? null : '2026-11-12T00:00:00Z',
  stripe_checkout_session_id: `cs_${id}`, stripe_payment_intent_id: `pi_${id}`, ...extra,
})
const session = (id: string, tagged = true) => ({ id: `cs_${id}`, metadata: { kind: 'space_donation', ...(tagged ? { hunt_ask_id: 'a1' } : {}) } })
const playerState = () => ({
  hunt_runs: [{ id: 'r1', hunt_id: 'h1', subject_profile_id: 'p1', state: 'active', revision: 3 }],
  hunt_progress: [{ run_id: 'r1', mission_key: 'm1', disposition: 'credited', revision: 1 }],
  hunt_claims: [{ id: 'c1', run_id: 'r1', mission_key: 'm1', state: 'accepted' }],
})

beforeEach(() => {
  vi.stubEnv('HUNTS_ENABLED', 'on')
  vi.stubEnv('HUNTS_COMMERCE_ENABLED', 'on')
  vi.spyOn(console, 'error').mockImplementation(() => {})
  writes.length = 0
  reads.length = 0
  checkout.create.mockReset()
  payee.canGive = true
  tables = {
    hunts: [{ id: 'h1', status: 'live' }],
    spaces: [{ id: 's1', name: 'Community Food Pantry', brand_name: null }],
    hunt_donation_asks: [{ ...ask }],
    hunt_donation_gifts: [],
    space_donations: [],
    ...playerState(),
  }
})
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })

const sync = () => import('./donation-sync')
const usd = async () => (await (await sync()).huntGiftTotals('a1'))[0]

describe('the gate', () => {
  it('opens only for an approved, enabled ask on a live Trail with a ready payee', async () => {
    const { openDonationAsk, huntGiftAskId } = await sync()
    expect(await openDonationAsk('h1')).toMatchObject({ askId: 'a1', beneficiarySpaceId: 's1', beneficiaryName: 'Community Food Pantry', suggestedAmountsCents: [500, 2500] })
    expect(await huntGiftAskId('h1', 's1')).toBe('a1')
    expect(await huntGiftAskId('h1', 'another-space')).toBeNull()
  })

  it.each([
    ['no approval is recorded (D8 unsigned)', () => { tables.hunt_donation_asks = [{ ...ask, approved_at: null, approved_by: null }] }],
    ['the approver is missing', () => { tables.hunt_donation_asks = [{ ...ask, approved_by: null }] }],
    ['the ask is not enabled', () => { tables.hunt_donation_asks = [{ ...ask, enabled: false }] }],
    ['the Trail has no ask', () => { tables.hunt_donation_asks = [] }],
    ['the Trail is a draft', () => { tables.hunts = [{ id: 'h1', status: 'draft' }] }],
    ['the beneficiary cannot take a gift', () => { payee.canGive = false }],
  ])('stays shut when %s', async (_label, arrange) => {
    arrange()
    const { openDonationAsk, huntGiftAskId } = await sync()
    expect(await openDonationAsk('h1')).toBeNull()
    expect(await huntGiftAskId('h1', 's1')).toBeNull()
  })

  it('reads and writes nothing while the commerce switch is off', async () => {
    vi.stubEnv('HUNTS_COMMERCE_ENABLED', '')
    tables.space_donations = [donation('d1', 'succeeded')]
    const { openDonationAsk, huntsAfterDonationSession, huntsAfterDonationRefund, mirrorGiftForSession, huntGiftTotals } = await sync()
    expect(await openDonationAsk('h1')).toBeNull()
    expect(await huntsAfterDonationSession(session('d1'))).toBeNull()
    expect(await mirrorGiftForSession('cs_d1', 'a1')).toBeNull()
    expect(await huntsAfterDonationRefund({ payment_intent: 'pi_d1', amount_refunded: 1000 })).toBeNull()
    expect(await huntGiftTotals('a1')).toEqual([])
    expect(reads).toEqual([])
    expect(writes).toEqual([])
  })
})

describe('starting a gift from a Trail', () => {
  it('creates no checkout when the approval is absent', async () => {
    tables.hunt_donation_asks = [{ ...ask, approved_at: null, approved_by: null }]
    const { startSpaceDonationCheckout } = await import('@/lib/billing/donation-actions')
    expect(await startSpaceDonationCheckout('s1', 1000, null, { huntId: 'h1' })).toMatchObject({ error: 'This fund is not open right now.' })
    expect(checkout.create).not.toHaveBeenCalled()
    expect(writes).toEqual([])
  })

  it('tags an approved gift with its ask and mirrors it as started', async () => {
    tables.space_donations = [donation('d1', 'pending')]
    checkout.create.mockResolvedValue({ clientSecret: 'secret', sessionId: 'cs_d1' })
    const { startSpaceDonationCheckout } = await import('@/lib/billing/donation-actions')
    expect(await startSpaceDonationCheckout('s1', 1000, null, { huntId: 'h1' })).toMatchObject({ data: { clientSecret: 'secret', sessionId: 'cs_d1' } })
    expect(checkout.create).toHaveBeenCalledWith(expect.objectContaining({ spaceId: 's1', huntAskId: 'a1', ui: 'elements' }))
    expect(tables.hunt_donation_gifts[0]).toMatchObject({ donation_id: 'd1', status: 'started' })
  })

  it('leaves an ordinary Space gift untagged and unmirrored', async () => {
    checkout.create.mockResolvedValue({ url: 'https://checkout.example/x' })
    const { startSpaceDonationCheckout } = await import('@/lib/billing/donation-actions')
    await startSpaceDonationCheckout('s1', 1000)
    expect(checkout.create).toHaveBeenCalledWith(expect.objectContaining({ huntAskId: null }))
    expect(reads).toEqual([])
  })
})

describe('the four money states', () => {
  it('success: a started gift is not raised until the provider settles it', async () => {
    const { mirrorGiftForSession, huntsAfterDonationSession } = await sync()
    tables.space_donations = [donation('d1', 'pending')]
    expect(await mirrorGiftForSession('cs_d1', 'a1')).toBe('created')
    expect(await usd()).toMatchObject({ raisedMinor: 0, startedMinor: 1000, settledCount: 0 })

    tables.space_donations[0].status = 'succeeded'
    tables.space_donations[0].succeeded_at = '2026-11-12T00:00:00Z'
    expect(await huntsAfterDonationSession(session('d1'))).toBe('updated')
    expect(tables.hunt_donation_gifts).toHaveLength(1)
    expect(tables.hunt_donation_gifts[0]).toMatchObject({ ask_id: 'a1', donation_id: 'd1', currency: 'USD', amount_minor: 1000, status: 'settled', settled_at: '2026-11-12T00:00:00Z' })
    expect(await usd()).toMatchObject({ currency: 'USD', raisedMinor: 1000, refundedMinor: 0, startedMinor: 0, settledCount: 1 })

    // A redelivered webhook changes nothing and adds no second gift.
    expect(await huntsAfterDonationSession(session('d1'))).toBe('unchanged')
    expect(tables.hunt_donation_gifts).toHaveLength(1)
  })

  it('abandonment: an expired checkout counts nowhere', async () => {
    const { mirrorGiftForSession, huntsAfterDonationSession } = await sync()
    tables.space_donations = [donation('d1', 'pending')]
    await mirrorGiftForSession('cs_d1', 'a1')
    tables.space_donations[0].status = 'abandoned'
    expect(await huntsAfterDonationSession(session('d1'))).toBe('updated')
    expect(tables.hunt_donation_gifts[0]).toMatchObject({ status: 'abandoned', settled_at: null })
    expect(await usd()).toMatchObject({ raisedMinor: 0, startedMinor: 0, refundedMinor: 0, settledCount: 0 })
  })

  it('full refund: the gift leaves the raised total', async () => {
    const { huntsAfterDonationSession, huntsAfterDonationRefund } = await sync()
    tables.space_donations = [donation('d1', 'succeeded')]
    await huntsAfterDonationSession(session('d1'))
    tables.space_donations[0].status = 'refunded' // the canonical recorder flips a full refund first
    expect(await huntsAfterDonationRefund({ payment_intent: 'pi_d1', amount_refunded: 1000 })).toBe('updated')
    expect(tables.hunt_donation_gifts[0]).toMatchObject({ status: 'refunded', refunded_minor: 1000 })
    expect(await usd()).toMatchObject({ raisedMinor: 0, refundedMinor: 1000, settledCount: 0 })
  })

  it('partial refund: raised is net of the refund, and a late older event cannot shrink it', async () => {
    const { huntsAfterDonationSession, huntsAfterDonationRefund } = await sync()
    tables.space_donations = [donation('d1', 'succeeded'), donation('d2', 'succeeded', { amount_cents: 2500 })]
    await huntsAfterDonationSession(session('d1'))
    await huntsAfterDonationSession(session('d2'))
    expect(await huntsAfterDonationRefund({ payment_intent: 'pi_d1', amount_refunded: 400 })).toBe('updated')
    expect(tables.hunt_donation_gifts[0]).toMatchObject({ status: 'settled', refunded_minor: 400 })
    expect(await usd()).toMatchObject({ raisedMinor: 600 + 2500, refundedMinor: 400, settledCount: 2 })

    expect(await huntsAfterDonationRefund({ payment_intent: 'pi_d1', amount_refunded: 400 })).toBe('unchanged')
    expect(await huntsAfterDonationRefund({ payment_intent: 'pi_d1', amount_refunded: 100 })).toBe('unchanged')
    expect(await usd()).toMatchObject({ raisedMinor: 3100, refundedMinor: 400 })

    // A second partial refund that completes the amount reads as a full refund.
    expect(await huntsAfterDonationRefund({ payment_intent: 'pi_d1', amount_refunded: 1000 })).toBe('updated')
    expect(await usd()).toMatchObject({ raisedMinor: 2500, refundedMinor: 1000, settledCount: 1 })
  })

  it('a missed mirror write cannot overstate raised: totals follow the canonical donation', async () => {
    const { huntsAfterDonationSession } = await sync()
    tables.space_donations = [donation('d1', 'succeeded')]
    await huntsAfterDonationSession(session('d1'))
    tables.space_donations[0].status = 'refunded' // the refund hook never ran
    expect(tables.hunt_donation_gifts[0].status).toBe('settled')
    expect(await usd()).toMatchObject({ raisedMinor: 0, refundedMinor: 1000, settledCount: 0 })
  })
})

describe('what is not a Trail gift', () => {
  it('ignores an ordinary Space donation, on settle and on refund', async () => {
    const { huntsAfterDonationSession, huntsAfterDonationRefund } = await sync()
    tables.space_donations = [donation('d1', 'succeeded')]
    expect(await huntsAfterDonationSession(session('d1', false))).toBeNull()
    expect(await huntsAfterDonationRefund({ payment_intent: 'pi_d1', amount_refunded: 1000 })).toBe('not_a_hunt_gift')
    expect(await huntsAfterDonationRefund({ payment_intent: 'pi_unknown', amount_refunded: 1000 })).toBeNull()
    expect(tables.hunt_donation_gifts).toEqual([])
  })

  it('refuses a gift whose ask names a different beneficiary, without throwing into settlement', async () => {
    const { huntsAfterDonationSession } = await sync()
    tables.space_donations = [donation('d1', 'succeeded', { space_id: 'someone-else' })]
    expect(await huntsAfterDonationSession(session('d1'))).toBe('failed')
    expect(tables.hunt_donation_gifts).toEqual([])
  })
})

describe('giving never changes progression', () => {
  it('leaves every run, claim and progress row untouched through all four states', async () => {
    const { mirrorGiftForSession, huntsAfterDonationSession, huntsAfterDonationRefund, huntGiftTotals, openDonationAsk } = await sync()
    tables.space_donations = [donation('d1', 'pending'), donation('d2', 'pending'), donation('d3', 'succeeded'), donation('d4', 'succeeded')]
    await openDonationAsk('h1')
    for (const id of ['d1', 'd2', 'd3', 'd4']) await mirrorGiftForSession(`cs_${id}`, 'a1')
    tables.space_donations[0].status = 'succeeded'
    await huntsAfterDonationSession(session('d1'))
    tables.space_donations[1].status = 'abandoned'
    await huntsAfterDonationSession(session('d2'))
    tables.space_donations[2].status = 'refunded'
    await huntsAfterDonationRefund({ payment_intent: 'pi_d3', amount_refunded: 1000 })
    await huntsAfterDonationRefund({ payment_intent: 'pi_d4', amount_refunded: 250 })
    expect(await huntGiftTotals('a1')).toEqual([{ currency: 'USD', raisedMinor: 1000 + 750, refundedMinor: 1000 + 250, startedMinor: 0, settledCount: 2 }])

    const { hunt_runs, hunt_progress, hunt_claims } = tables
    expect({ hunt_runs, hunt_progress, hunt_claims }).toEqual(playerState())
    expect(new Set(writes)).toEqual(new Set(['hunt_donation_gifts']))
    expect(reads.filter((t) => /^hunt_(runs|progress|claims)$/.test(t))).toEqual([])
  })

  it('names no run, claim, progress or database function in its source', () => {
    const src = readFileSync(join(process.cwd(), 'lib/hunts/donation-sync.ts'), 'utf8')
    const code = src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
    expect(code).not.toMatch(/hunt_runs|hunt_progress|hunt_claims|\.rpc\(|huntRpc|run-store/)
  })
})
