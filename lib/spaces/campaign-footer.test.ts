import { describe, expect, it } from 'vitest'
import { campaignCarriesFrequencyFooter, frequencyFooterHtml } from './campaign-footer'

describe('the Frequency footer on free Space campaigns (ADR-1709)', () => {
  it('a free Space carries it, a paid plan does not', () => {
    expect(campaignCarriesFrequencyFooter('free')).toBe(true)
    expect(campaignCarriesFrequencyFooter(null)).toBe(true)
    expect(campaignCarriesFrequencyFooter('business')).toBe(false)
    expect(campaignCarriesFrequencyFooter('collective')).toBe(false)
    expect(frequencyFooterHtml('business')).toBe('')
    expect(frequencyFooterHtml('free')).toContain('Sent with')
  })
})
