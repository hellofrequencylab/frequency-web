/**
 * FH-011S regression proof. With every Hunt switch off, the legacy check-in (Regulars stamp), reward
 * (Connector grant) and commerce (Market ticket projection, ticket checkout gate, store-order hooks) paths
 * behave as before AND nothing touches a hunt_ table or rpc. Companion to legacy-paths.test.ts, which
 * proves the happy-path outputs; this file adds the zero-Hunt-boundary assertion, the observability
 * signal and the rollback proof. Staging SHA acceptance stays with release engineering (see the ledger row).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type Stripe from 'stripe'
import { listTicketedEventProjections } from '@/lib/commerce/ticket-projection'
import { recordLoyaltyVisit } from '@/lib/loyalty/visit'
import { grantConnectorOutcome } from '@/lib/rewards/connector'
import { guarded } from './commerce-hooks'
import { HUNT_SWITCH_KEYS, huntSwitchOn, type HuntSwitch } from './flags'
import { huntsAfterOrderRefund, huntsAfterOrderSession } from './order-hooks'
import { passCheckoutGate } from './pass-gate'
import { loadScanPlacement, openClaim, claimAsPlayer } from './claim-store'

const fake = vi.hoisted(() => ({
  rpc: vi.fn(),
  insertReward: vi.fn(),
  tables: [] as string[],
  awardCheckIn: vi.fn(async () => ({ awarded: true, amount: 25 })),
  awardConnector: vi.fn(async () => ({ awarded: true, amount: 4 })),
}))

vi.mock('@/lib/loyalty/store', () => ({
  loyaltyEnabled: () => true,
  getLoyaltyProgram: async () => ({ status: 'on', rewardTitle: 'Free coffee' }),
}))
vi.mock('@/lib/zaps', () => ({ awardZapsForAction: fake.awardCheckIn, awardZaps: fake.awardConnector }))
vi.mock('@/lib/gems', () => ({ awardGems: vi.fn() }))
vi.mock('@/lib/achievements', () => ({ processGamificationEvent: vi.fn(async () => undefined) }))
vi.mock('@/lib/notifications/router', () => ({ routeNotification: vi.fn() }))
vi.mock('@/lib/events/poster-media', () => ({ posterSignedUrlMap: vi.fn() }))

/** One admin client for every module under test: it records each table and rpc touched. */
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    rpc: fake.rpc,
    from(table: string) {
      fake.tables.push(table)
      if (table === 'reward_grants') {
        const count = { select: () => count, eq: () => count, like: () => count, gte: async () => ({ count: 0, error: null }) }
        return { ...count, insert: fake.insertReward }
      }
      const data = table === 'events'
        ? [{ id: 'event-1', slug: 'legacy-ticket', title: 'Legacy ticket', currency: 'usd', starts_at: '2099-01-01T00:00:00Z', theme: null, organizer_name: 'Legacy host' }]
        : table === 'event_ticket_types'
          ? [{ event_id: 'event-1', pricing_mode: 'fixed', price_cents: 1250, min_cents: null, suggested_cents: null }]
          : null
      const read: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'or', 'order', 'limit', 'in']) read[m] = () => read
      read.returns = async () => ({ data, error: null })
      read.maybeSingle = async () => ({ data: null, error: null })
      return read
    },
  }),
}))

const SWITCHES = Object.keys(HUNT_SWITCH_KEYS) as HuntSwitch[]
const setAll = (value: string) => { for (const key of Object.values(HUNT_SWITCH_KEYS)) vi.stubEnv(key, value) }
const huntBoundaryCalls = () => [
  ...fake.tables.filter((t) => t.startsWith('hunt_')),
  ...fake.rpc.mock.calls.map((c) => String(c[0])).filter((n) => n.startsWith('hunt_')),
]

/** Every legacy path once, plus the Hunt-aware gate that must stay inert. */
async function runLegacyPaths() {
  fake.rpc.mockResolvedValueOnce({ data: { stamps: 2, required: 6, earned: false, stamped: true }, error: null })
  fake.insertReward.mockResolvedValueOnce({ error: null })
  return {
    stamp: await recordLoyaltyVisit('space-1', 'member-1', '2026-11-10'),
    reward: await grantConnectorOutcome({ inviterProfileId: 'inviter-1', guestKey: 'guest-1', outcome: 'rsvp' }),
    market: await listTicketedEventProjections(),
    gate: await passCheckoutGate({ eventId: 'event-1', ticketTypeId: 'tier-1', qty: 1 }),
  }
}

describe('FH-011S legacy regression with every Hunt switch off', () => {
  let errors: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    vi.clearAllMocks()
    fake.tables.length = 0
    setAll('')
    errors = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })
  afterEach(() => { vi.unstubAllEnvs(); errors.mockRestore() })

  it('covers the full switch list and has them all off', () => {
    expect([...SWITCHES].sort()).toEqual(['authoring', 'claims', 'commerce', 'enabled', 'rewards', 'worker'])
    expect(SWITCHES.map(huntSwitchOn)).toEqual(SWITCHES.map(() => false))
  })

  it('runs check-in, reward and commerce exactly as before and never touches a hunt_ table or rpc', async () => {
    const out = await runLegacyPaths()
    expect(out.stamp).toMatchObject({ outcome: { stamps: 2, required: 6, rewardTitle: 'Free coffee' }, zapsAwarded: 25 })
    expect(out.reward).toEqual({ granted: true, zaps: 4, gems: 0 })
    expect(out.market).toEqual([expect.objectContaining({ id: 'event:event-1', href: '/events/legacy-ticket', priceCents: 1250, projected: true })])
    expect(out.gate).toBeNull()
    expect(fake.rpc.mock.calls.map((c) => c[0])).toEqual(['loyalty_record_visit'])
    expect(fake.tables).toEqual(['reward_grants', 'reward_grants', 'events', 'event_ticket_types'])
    expect(huntBoundaryCalls()).toEqual([])
  })

  it('keeps Hunt claim, order and refund entry points inert with zero boundary calls', async () => {
    await expect(openClaim('member-1', 'placement-1', 0)).resolves.toEqual({ ok: false, reason: 'disabled' })
    await expect(claimAsPlayer('member-1', { placementId: 'p', token: 't', idempotencyKey: 'k', nowEpoch: 0 }))
      .resolves.toEqual({ ok: false, reason: 'disabled' })
    await expect(loadScanPlacement({ code: 'abcdef12' })).resolves.toBeNull()
    await huntsAfterOrderSession('cs_legacy')
    await huntsAfterOrderRefund({ id: 'ch_1', payment_intent: 'pi_1', amount: 100, amount_refunded: 100, currency: 'usd' } as Stripe.Charge)
    expect(fake.tables).toEqual([])
    expect(fake.rpc).not.toHaveBeenCalled()
  })

  it('observability: an off switch reports skipped, runs nothing and logs no failure', async () => {
    const work = vi.fn(async () => undefined)
    const onFailure = vi.fn(async () => undefined)
    await expect(guarded('order-projection', work, onFailure)).resolves.toBe('skipped')
    expect(work).not.toHaveBeenCalled()
    expect(onFailure).not.toHaveBeenCalled()
    await runLegacyPaths()
    expect(errors.mock.calls.filter((c: unknown[]) => String(c[0]).startsWith('[hunts-'))).toEqual([])
    // The same wrapper reports 'ok' once the switch is on, so 'skipped' is a real, distinguishable signal.
    setAll('1')
    await expect(guarded('order-projection', work, onFailure)).resolves.toBe('ok')
  })

  it('rollback: switching commerce off after on returns to the legacy ticket path', async () => {
    const legacy = await runLegacyPaths()
    fake.tables.length = 0

    setAll('1')
    await passCheckoutGate({ eventId: 'event-1', ticketTypeId: 'tier-1', qty: 1 })
    expect(fake.tables).toEqual(['hunt_pass_bindings']) // proves the probe sees Hunt reads when on

    setAll('')
    fake.tables.length = 0
    fake.rpc.mockClear()
    const rolledBack = await runLegacyPaths()
    expect(rolledBack).toEqual(legacy)
    expect(huntBoundaryCalls()).toEqual([])
    await expect(openClaim('member-1', 'placement-1', 0)).resolves.toEqual({ ok: false, reason: 'disabled' })
  })
})
