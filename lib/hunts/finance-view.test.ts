// FH-040: reconciliation matching, the redacted reader and the fail-closed kill switch.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createReconciliationReader, huntSalesOpen, matchReconciliation, setHuntSales, sourceHash, RECONCILIATION_PENDING_MINUTES } from './finance-view'

const ok = { currency: 'USD', expectedAmountMinor: 9000, providerAmountMinor: 9000, feeMinor: 450, refundedMinor: 0, transferMinor: 8550, openEntitlements: 2, ageMinutes: 10 }

describe('matchReconciliation', () => {
  it('matches when amount, currency, fee and transfer agree', () => {
    expect(matchReconciliation(ok)).toEqual({ status: 'matched', note: null })
  })
  it('is pending until the provider reports, then an exception once it ages out', () => {
    expect(matchReconciliation({ ...ok, providerAmountMinor: null })).toMatchObject({ status: 'pending' })
    expect(matchReconciliation({ ...ok, providerAmountMinor: null, ageMinutes: RECONCILIATION_PENDING_MINUTES + 1 })).toEqual({ status: 'exception', note: 'provider_record_missing' })
  })
  it.each([
    ['amount_mismatch', { providerAmountMinor: 8000 }],
    ['currency_mismatch', { providerCurrency: 'eur' }],
    ['refund_exceeds_sale', { refundedMinor: 9001 }],
    ['fee_exceeds_sale', { feeMinor: 9500 }],
    ['transfer_mismatch', { transferMinor: 9000 }],
    ['refunded_with_open_benefit', { refundedMinor: 9000, transferMinor: null }],
  ])('flags %s', (note, patch) => {
    expect(matchReconciliation({ ...ok, ...patch })).toEqual({ status: 'exception', note })
  })
  it('accepts a fully refunded source once every benefit is closed', () => {
    expect(matchReconciliation({ ...ok, refundedMinor: 9000, transferMinor: null, openEntitlements: 0 }).status).toBe('matched')
  })
})

describe('createReconciliationReader', () => {
  const rows = [
    { source_type: 'event-ticket', source_id: 'aaaaaaaa-1', currency: 'USD', expected_amount_minor: 4500, status: 'matched', first_seen_at: '2026-11-10T00:00:00Z', seller_space_id: 's1' },
    { source_type: 'store-order', source_id: 'bbbbbbbb-2', currency: 'USD', expected_amount_minor: 1200, status: 'exception', first_seen_at: '2026-11-09T00:00:00Z', seller_space_id: 's2' },
  ]
  const fake = (seen: string[]) => () => {
    const q: Record<string, unknown> = {}
    const chain = () => q
    Object.assign(q, {
      select: chain, order: chain, limit: chain,
      eq: (c: string, v: string) => { seen.push(`${c}=${v}`); return q },
      then: (res: (v: unknown) => unknown) => res({ data: rows.filter((r) => !seen.length || seen.every((s) => s === `seller_space_id=${r.seller_space_id}`)), error: null }),
    })
    return { from: () => q } as never
  }
  it('redacts: a hash, never a raw id, and orders exceptions first', async () => {
    const out = await createReconciliationReader(fake([]), () => Date.parse('2026-11-10T01:00:00Z'))({ role: 'platform-admin' })
    expect(out.map((r) => r.status)).toEqual(['exception', 'matched'])
    expect(out[0].sourceHash).toBe(sourceHash('store-order', 'bbbbbbbb-2'))
    expect(JSON.stringify(out)).not.toContain('bbbbbbbb')
    expect(out[1].ageMinutes).toBe(60)
  })
  it('applies the space scope to the query', async () => {
    const seen: string[] = []
    const out = await createReconciliationReader(fake(seen))({ role: 'space-owner', spaceId: 's1' })
    expect(seen).toEqual(['seller_space_id=s1'])
    expect(out).toHaveLength(1)
  })
  it('returns nothing for an unknown role', async () => {
    expect(await createReconciliationReader(fake([]))({ role: 'guest' } as never)).toEqual([])
  })
})

describe('huntSalesOpen', () => {
  const client = (result: unknown) => () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => result }) }) }) }) as never
  it('is open only on an explicit open row', async () => {
    expect(await huntSalesOpen(client({ data: { sales_open: true }, error: null }))).toBe(true)
    expect(await huntSalesOpen(client({ data: { sales_open: false }, error: null }))).toBe(false)
  })
  it('fails CLOSED on a missing row, an error or a throw', async () => {
    expect(await huntSalesOpen(client({ data: null, error: null }))).toBe(false)
    expect(await huntSalesOpen(client({ data: null, error: { message: 'x' } }))).toBe(false)
    expect(await huntSalesOpen(() => { throw new Error('down') })).toBe(false)
  })
  it('flips the switch through the audited function', async () => {
    let seen: Record<string, unknown> = {}
    expect(await setHuntSales(async (_f, a) => { seen = a; return { data: false, error: null } }, false, 'p1', 'outage drill')).toBe(false)
    expect(seen).toEqual({ p_open: false, p_actor: 'p1', p_reason: 'outage drill' })
  })
})

describe('kill switch scope', () => {
  const read = (f: string) => readFileSync(join('lib', 'hunts', f), 'utf8')
  it('is read by the sale path only: settlement, refunds and reconciliation never consult it', () => {
    for (const f of ['entitlements.ts', 'refunds.ts', 'merch.ts']) expect(read(f)).not.toMatch(/salesOpen|sales_open|huntSalesOpen/)
    expect(read('pass-binding.ts')).toContain('commerceOpen')
  })
})
