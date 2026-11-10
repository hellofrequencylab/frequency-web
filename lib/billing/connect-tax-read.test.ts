import { afterEach, describe, expect, it, vi } from 'vitest'

const earnings = vi.fn()
vi.mock('@/lib/finance/record', () => ({ connectedAccountEarningsSince: earnings }))
vi.mock('./stripe', () => ({ stripe: null }))

afterEach(() => { vi.unstubAllEnvs(); earnings.mockReset() })

describe('memberTaxNotice', () => {
  it('does no query at all while the flag is off', async () => {
    const { memberTaxNotice } = await import('./connect-tax-read')
    expect(await memberTaxNotice('acct_1')).toBeNull()
    expect(earnings).not.toHaveBeenCalled()
  })
  it('is null without an account even when on', async () => {
    vi.stubEnv('CONNECT_TAX_REPORTING_ENABLED', '1')
    const { memberTaxNotice } = await import('./connect-tax-read')
    expect(await memberTaxNotice(null)).toBeNull()
    expect(earnings).not.toHaveBeenCalled()
  })
  it('reads the year to date for the account and warns near the threshold', async () => {
    vi.stubEnv('CONNECT_TAX_REPORTING_ENABLED', '1')
    earnings.mockResolvedValue({ cents: 1_700_000, transactions: 170 })
    const { memberTaxNotice } = await import('./connect-tax-read')
    expect(await memberTaxNotice('acct_1')).toMatch(/close/)
  })
})
