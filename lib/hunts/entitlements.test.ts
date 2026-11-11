// FH-037: projecting benefits from a settled ticket. The database makes the projection idempotent
// (supabase/migrations/20270346041000_hunt_commerce.sql); these tests hold the plan and the caller.
import { describe, expect, it } from 'vitest'
import { consumeEntitlement, findMissingIntents, intentRetryMinutes, planTicketProjection, projectPlan, unitSemanticKey, type Rpc, type TicketSource } from './entitlements'
import type { PassBinding } from './pass-binding'

const binding: PassBinding = { id: 'b1', huntId: 'h1', versionId: 'v1', eventId: 'e1', ticketTypeId: 't1', sellerSpaceId: 's1', benefitCodes: ['dinner', 'stamp-card'], revision: 3, status: 'active' }
const source: TicketSource = {
  kind: 'event-ticket', id: 'tk1', status: 'succeeded', refundedAt: null, disputeOpen: false, eventId: 'e1', ticketTypeId: 't1',
  sellerSpaceId: 's1', currency: 'usd', qty: 2, seats: [{ unit: 'seat-1', profileId: 'p1' }, { unit: 'seat-2', profileId: null }],
}

describe('planTicketProjection', () => {
  it('projects one benefit per seat and code, and keeps a guest seat unclaimed', () => {
    const plan = planTicketProjection(source, binding)
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.units).toHaveLength(4)
    expect(plan.units.filter((u) => u.unitKey === 'seat-2').every((u) => u.profileId === null)).toBe(true)
    expect(plan.units.filter((u) => u.unitKey === 'seat-1').every((u) => u.profileId === 'p1')).toBe(true)
    expect(new Set(plan.units.map((u) => u.semanticKey)).size).toBe(4)
    expect(plan.units[0].bindingRevision).toBe(3)
  })
  it('waits for a delayed payment and refuses failed and refunded ones', () => {
    expect(planTicketProjection({ ...source, status: 'pending' }, binding)).toMatchObject({ ok: false, disposition: 'pending' })
    expect(planTicketProjection({ ...source, status: 'failed' }, binding)).toMatchObject({ ok: false, disposition: 'refused' })
    expect(planTicketProjection({ ...source, status: 'refunded' }, binding)).toMatchObject({ ok: false, disposition: 'refused' })
    expect(planTicketProjection({ ...source, refundedAt: '2026-11-10T00:00:00Z' }, binding)).toMatchObject({ ok: false, disposition: 'refused' })
  })
  it('sends a wrong Event, tier, seller, currency or seat count to review', () => {
    for (const patch of [{ eventId: 'e2' }, { ticketTypeId: 't2' }, { sellerSpaceId: 's2' }, { currency: '' }, { qty: 3 }]) {
      expect(planTicketProjection({ ...source, ...patch }, binding)).toMatchObject({ ok: false, disposition: 'review' })
    }
  })
  it('sends an open dispute to review', () => {
    expect(planTicketProjection({ ...source, disputeOpen: true }, binding)).toMatchObject({ ok: false, reason: 'dispute_open' })
  })
  it('does not fold two units into one key', () => {
    expect(unitSemanticKey('h', 'order', 'line:1', 'c')).not.toBe(unitSemanticKey('h', 'order', 'line:2', 'c'))
  })
})

describe('projectPlan', () => {
  it('calls the database once per unit and counts each answer', async () => {
    const calls: Record<string, unknown>[] = []
    const rpc: Rpc = async (_fn, args) => {
      calls.push(args)
      return { data: calls.length === 1 ? 'created' : 'exists', error: null }
    }
    const { summary } = await projectPlan(rpc, planTicketProjection(source, binding))
    expect(calls).toHaveLength(4)
    expect(summary).toMatchObject({ created: 1, exists: 3 })
    expect(calls[0]).toMatchObject({ p_binding_id: 'b1', p_offer_id: null, p_source_type: 'event-ticket' })
  })
  it('does nothing for a plan that is not ok', async () => {
    const rpc: Rpc = async () => { throw new Error('should not be called') }
    const out = await projectPlan(rpc, { ok: false, disposition: 'pending', reason: 'x' })
    expect(out.summary.created).toBe(0)
  })
  it('throws on a database error or an unknown answer rather than reading it as success', async () => {
    await expect(projectPlan(async () => ({ data: null, error: { message: 'boom' } }), planTicketProjection(source, binding))).rejects.toThrow('boom')
    await expect(projectPlan(async () => ({ data: 'weird', error: null }), planTicketProjection(source, binding))).rejects.toThrow('does not know')
  })
})

describe('consumeEntitlement', () => {
  it('narrows the answer', async () => {
    expect(await consumeEntitlement(async () => ({ data: 'revoked', error: null }), 'e', 'a', 'r')).toBe('revoked')
    await expect(consumeEntitlement(async () => ({ data: 'nope', error: null }), 'e', 'a', 'r')).rejects.toThrow()
  })
})

describe('repair', () => {
  it('finds a settled source on a bound tier with no benefit, and skips others', () => {
    const byTier = new Map([['t1', binding]])
    const out = findMissingIntents(
      [{ sourceId: 'a', ticketTypeId: 't1' }, { sourceId: 'b', ticketTypeId: 't1' }, { sourceId: 'c', ticketTypeId: 't9' }, { sourceId: 'd', ticketTypeId: null }],
      byTier,
      new Set(['b']),
    )
    expect(out).toEqual([{ sourceId: 'a', bindingId: 'b1' }])
  })
  it('backs off to six hours and then gives up to review', () => {
    expect(intentRetryMinutes(0)).toBe(1)
    expect(intentRetryMinutes(5)).toBe(32)
    expect(intentRetryMinutes(11)).toBe(360)
    expect(intentRetryMinutes(12)).toBeNull()
  })
})
