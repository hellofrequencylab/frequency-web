// FH-039: refund, dispute and consumption decisions. The race itself (a refund against a staff scan) is
// serialized by the row lock in hunt_entitlement_reverse / hunt_entitlement_consume.
import { describe, expect, it } from 'vitest'
import { applyReversal, decideReversal, pickUnitsToRevoke } from './refunds'
import type { Rpc } from './entitlements'

describe('decideReversal', () => {
  it('revokes a whole source on a full refund and a lost dispute', () => {
    expect(decideReversal({ kind: 'refund_full', ref: 're_1' }).actions).toEqual([{ mode: 'refund', unitKey: null, ref: 're_1' }])
    expect(decideReversal({ kind: 'dispute_lost', ref: 'dp_1' }).actions[0].mode).toBe('dispute_lost')
  })
  it('maps a partial refund to the explicit units only, de-duplicated and ordered', () => {
    const d = decideReversal({ kind: 'refund_partial', ref: 're_2', amountMinor: 2000, currency: 'usd', unitKeys: ['seat-2', 'seat-2', 'seat-1'] })
    expect(d.actions.map((a) => a.unitKey)).toEqual(['seat-1', 'seat-2'])
    expect(d.cases).toEqual([])
  })
  it('never infers a unit from an amount: an unmapped partial opens a review case', () => {
    for (const unitKeys of [null, []]) {
      const d = decideReversal({ kind: 'refund_partial', ref: 're_3', amountMinor: 2000, currency: 'usd', unitKeys })
      expect(d.actions).toEqual([])
      expect(d.cases).toEqual([{ kind: 'partial_unmapped', ref: 're_3', amountMinor: 2000, currency: 'usd' }])
    }
  })
  it('suspends on an opened dispute and restores a won one only while canonical state is still paid', () => {
    expect(decideReversal({ kind: 'dispute_opened', ref: 'dp_2' }).actions[0].mode).toBe('dispute_open')
    expect(decideReversal({ kind: 'dispute_won', ref: 'dp_2', canonicalStillPaid: true }).actions[0].mode).toBe('dispute_won')
    expect(decideReversal({ kind: 'dispute_won', ref: 'dp_2', canonicalStillPaid: false })).toEqual({ actions: [], cases: [], restoreBlocked: 'not_paid' })
  })
})

describe('pickUnitsToRevoke', () => {
  const units = [
    { unitKey: 'line:1', state: 'consumed' as const },
    { unitKey: 'line:2', state: 'active' as const },
    { unitKey: 'line:3', state: 'active' as const },
    { unitKey: 'line:4', state: 'revoked' as const },
  ]
  it('takes unused units first, highest index first, and never a revoked one', () => {
    expect(pickUnitsToRevoke(units, 1)).toEqual(['line:3'])
    expect(pickUnitsToRevoke(units, 2)).toEqual(['line:3', 'line:2'])
  })
  it('touches consumed history only when nothing unused is left', () => {
    expect(pickUnitsToRevoke(units, 3)).toEqual(['line:3', 'line:2', 'line:1'])
    expect(pickUnitsToRevoke(units, 0)).toEqual([])
  })
})

describe('applyReversal', () => {
  it('calls the database per action, opens cases once, and totals the counts', async () => {
    const log: string[] = []
    const rpc: Rpc = async (fn, args) => {
      log.push(`${fn}:${String(args.p_mode ?? args.p_kind)}`)
      return fn === 'hunt_refund_case_open' ? { data: true, error: null } : { data: { revoked: 1, suspended: 0, restored: 0, cases: 1 }, error: null }
    }
    const decision = decideReversal({ kind: 'refund_partial', ref: 're', amountMinor: 1, currency: 'usd', unitKeys: ['seat-1', 'seat-2'] })
    const out = await applyReversal(rpc, { type: 'event-ticket', id: 'tk' }, decision)
    expect(out).toMatchObject({ revoked: 2, cases: 2, reviewOpened: 0 })
    const unmapped = await applyReversal(rpc, { type: 'event-ticket', id: 'tk' }, decideReversal({ kind: 'refund_partial', ref: 're', amountMinor: 1, currency: 'usd', unitKeys: null }))
    expect(unmapped.reviewOpened).toBe(1)
    expect(log).toContain('hunt_refund_case_open:partial_unmapped')
  })
  it('throws on a database error', async () => {
    await expect(applyReversal(async () => ({ data: null, error: { message: 'down' } }), { type: 'store-order', id: 'o' }, decideReversal({ kind: 'refund_full', ref: 'r' }))).rejects.toThrow('down')
  })
})
