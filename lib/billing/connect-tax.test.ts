import { afterEach, describe, expect, it, vi } from 'vitest'
import { form1099Status, taxInfoState, taxNotice, connectTaxReportingEnabled } from './connect-tax'

afterEach(() => vi.unstubAllEnvs())

describe('form1099Status', () => {
  it('is below, approaching, likely by the advisory thresholds', () => {
    expect(form1099Status(0, 0)).toBe('below')
    expect(form1099Status(1_000_000, 100)).toBe('below')
    expect(form1099Status(1_700_000, 170)).toBe('approaching')
    expect(form1099Status(2_100_000, 201)).toBe('likely')
  })
  it('needs both gross and count, never one alone', () => {
    expect(form1099Status(9_000_000, 50)).toBe('below')
    expect(form1099Status(190_000, 500)).toBe('below')
  })
  it('treats junk as zero', () => {
    expect(form1099Status(NaN, -4)).toBe('below')
  })
})

describe('taxInfoState', () => {
  it('finds the tax-identity requirement keys', () => {
    const r = taxInfoState({ requirements: { currently_due: ['individual.ssn_last_4', 'external_account'], past_due: [], eventually_due: ['company.tax_id'] } } as never)
    expect(r).toEqual({ needsTaxInfo: true, keys: ['individual.ssn_last_4', 'company.tax_id'] })
  })
  it('is quiet when nothing tax-shaped is due or the account is missing', () => {
    expect(taxInfoState({ requirements: { currently_due: ['external_account'], past_due: [], eventually_due: [] } } as never).needsTaxInfo).toBe(false)
    expect(taxInfoState(null).needsTaxInfo).toBe(false)
  })
})

describe('taxNotice', () => {
  const none = { needsTaxInfo: false, keys: [] }
  it('is dark by default', () => {
    expect(connectTaxReportingEnabled()).toBe(false)
    expect(taxNotice({ gross: { cents: 9_999_999, transactions: 999 }, info: { needsTaxInfo: true, keys: ['x'] } })).toBeNull()
  })
  it('speaks in plain words when on', () => {
    vi.stubEnv('CONNECT_TAX_REPORTING_ENABLED', '1')
    expect(taxNotice({ gross: { cents: 0, transactions: 0 }, info: none })).toBeNull()
    expect(taxNotice({ gross: { cents: 0, transactions: 0 }, info: { needsTaxInfo: true, keys: ['a'] } })).toMatch(/tax details/)
    expect(taxNotice({ gross: { cents: 2_500_000, transactions: 250 }, info: none })).toMatch(/likely/)
    expect(taxNotice({ gross: { cents: 1_700_000, transactions: 170 }, info: none })).toMatch(/close/)
  })
})
