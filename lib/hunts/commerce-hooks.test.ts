import { describe, expect, it, vi } from 'vitest'
import { activateClaimedSeat, applyChargeReversal, guarded, nextIntentState, reversalForCharge, reversalForDispute } from './commerce-hooks'
import type { Rpc } from './entitlements'

const charge = (amount: number, refunded: number) => ({ id: 'ch_1', amount, amount_refunded: refunded, currency: 'usd' })

describe('reversalForCharge', () => {
  it('does nothing when nothing was refunded', () => {
    expect(reversalForCharge(charge(5000, 0))).toBeNull()
  })
  it('a full refund revokes the whole source under a stable reference', () => {
    const d = reversalForCharge(charge(5000, 5000))
    expect(d?.actions).toEqual([{ mode: 'refund', unitKey: null, ref: 'ch_1:5000' }])
    expect(reversalForCharge(charge(5000, 5000))).toEqual(d)
  })
  it('a partial refund never guesses a seat from the amount: it opens a review case', () => {
    const d = reversalForCharge(charge(5000, 1500))
    expect(d?.actions).toEqual([])
    expect(d?.cases).toEqual([{ kind: 'partial_unmapped', ref: 'ch_1:1500', amountMinor: 1500, currency: 'usd' }])
  })
  it('a later, larger refund has a different reference', () => {
    expect(reversalForCharge(charge(5000, 2500))?.cases[0].ref).not.toBe(reversalForCharge(charge(5000, 1500))?.cases[0].ref)
  })
})

describe('reversalForDispute', () => {
  it('a lost dispute revokes; an open one changes nothing here', () => {
    expect(reversalForDispute({ id: 'dp_1', status: 'lost' }, true)?.actions[0].mode).toBe('dispute_lost')
    expect(reversalForDispute({ id: 'dp_1', status: 'needs_response' }, true)).toBeNull()
  })
  it('a won dispute restores only while canonical state is still paid', () => {
    expect(reversalForDispute({ id: 'dp_1', status: 'won' }, true)?.actions[0].mode).toBe('dispute_won')
    expect(reversalForDispute({ id: 'dp_1', status: 'won' }, false)?.restoreBlocked).toBe('not_paid')
  })
})

describe('guarded', () => {
  it('is a no-op while the switch is off', async () => {
    const fn = vi.fn()
    expect(await guarded('x', fn, async () => {}, () => false)).toBe('skipped')
    expect(fn).not.toHaveBeenCalled()
  })
  it('never throws, and records the failure so it is noticed', async () => {
    const record = vi.fn(async () => {})
    const out = await guarded('projection', async () => { throw new Error('boom') }, record, () => true)
    expect(out).toBe('failed')
    expect(record).toHaveBeenCalledWith('projection: boom')
  })
  it('still does not throw when even the record fails', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const out = await guarded('p', async () => { throw new Error('a') }, async () => { throw new Error('b') }, () => true)
    expect(out).toBe('failed')
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
})

describe('nextIntentState', () => {
  it('backs off, then goes to review', () => {
    expect(nextIntentState(1, 0).status).toBe('pending')
    expect(nextIntentState(12, 0).status).toBe('review')
  })
})

describe('applyChargeReversal and activateClaimedSeat', () => {
  it('replaying a reversal sends the same reference each time', async () => {
    const calls: Array<Record<string, unknown>> = []
    const rpc: Rpc = async (_fn, args) => { calls.push(args); return { data: { revoked: 1 }, error: null } }
    await applyChargeReversal(rpc, 't1', reversalForCharge(charge(5000, 5000)))
    await applyChargeReversal(rpc, 't1', reversalForCharge(charge(5000, 5000)))
    expect(calls[0]).toEqual(calls[1])
    expect(calls[0].p_ref).toBe('ch_1:5000')
  })
  it('a null decision touches nothing', async () => {
    const rpc = vi.fn()
    await applyChargeReversal(rpc as unknown as Rpc, 't1', null)
    expect(rpc).not.toHaveBeenCalled()
  })
  it('attaches the verified attendee to their own seat', async () => {
    const rpc: Rpc = async () => ({ data: 2, error: null })
    expect(await activateClaimedSeat(rpc, 't1', 'seat-2', 'p1')).toBe(2)
  })
})
