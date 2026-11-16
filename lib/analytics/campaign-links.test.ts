import { describe, expect, it } from 'vitest'
import { pixelSafeAttributionQuery } from './sanitize'
import { buildCampaignLink, CAMPAIGN_SOURCES, type CampaignSource } from './campaign-links'
const id = 'a7452a9d-c9c8-4b7a-97b1-afc59859c001'
describe('campaign links', () => {
  it('keeps private labels out of public tracking identifiers', () => {
    const result = buildCampaignLink({ id, source: 'email', landing: '/join', privateLabel: 'Private wellness subject' })
    expect(result.url).toBe(`https://frequencylocal.com/join?utm_source=email&utm_medium=email&utm_campaign=${id}`)
    expect(result.url).not.toContain('wellness')
    expect(result.mapping.privateLabel).toBe('Private wellness subject')
  })
  it('uses governed source and medium pairs', () => {
    for (const source of Object.keys(CAMPAIGN_SOURCES) as CampaignSource[]) {
      const result = new URL(buildCampaignLink({ id, source, landing: '/', privateLabel: '' }).url)
      expect(result.searchParams.get('utm_medium')).toBe(CAMPAIGN_SOURCES[source].medium)
      expect(result.searchParams.get('utm_campaign')).toBe(id)
      expect(pixelSafeAttributionQuery(result.search)).toBe(result.search)
    }
  })
  it('rejects human-topic identifiers and arbitrary redirect destinations', () => {
    expect(() => buildCampaignLink({ id: 'grief-circle', source: 'email', landing: '/', privateLabel: '' })).toThrow()
    expect(() => buildCampaignLink({ id, source: 'email', landing: '//outside.example' as '/', privateLabel: '' })).toThrow()
    expect(() => buildCampaignLink({ id, source: 'other' as 'email', landing: '/', privateLabel: '' })).toThrow()
  })
})
