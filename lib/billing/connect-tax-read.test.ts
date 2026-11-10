import { afterEach, describe, expect, it, vi } from 'vitest'

const from = vi.fn()
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from }) }))
vi.mock('./stripe', () => ({ stripe: null }))

afterEach(() => { vi.unstubAllEnvs(); from.mockReset() })

describe('memberTaxNotice', () => {
  it('does no query at all while the flag is off', async () => {
    const { memberTaxNotice } = await import('./connect-tax-read')
    expect(await memberTaxNotice('acct_1')).toBeNull()
    expect(from).not.toHaveBeenCalled()
  })
  it('is null without an account even when on', async () => {
    vi.stubEnv('CONNECT_TAX_REPORTING_ENABLED', '1')
    const { memberTaxNotice } = await import('./connect-tax-read')
    expect(await memberTaxNotice(null)).toBeNull()
    expect(from).not.toHaveBeenCalled()
  })
  it('sums this year\'s ledger rows for the account, nets refunds, and warns near the threshold', async () => {
    vi.stubEnv('CONNECT_TAX_REPORTING_ENABLED', '1')
    const rows = [...Array(170).fill({ amount_cents: 10_000, revenue_type: 'commerce' }), { amount_cents: -5_000, revenue_type: 'refund' }]
    const chain: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'in', 'gte']) chain[m] = () => chain
    chain.limit = async () => ({ data: rows, error: null })
    from.mockReturnValue(chain)
    const { memberTaxNotice } = await import('./connect-tax-read')
    expect(await memberTaxNotice('acct_1')).toMatch(/close/)
  })
})
