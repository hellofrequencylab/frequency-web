import { describe, expect, it } from 'vitest'
import { appendCampaignUtm } from './utm'
import { pixelSafeAttributionQuery } from '@/lib/analytics/sanitize'

const campaignId = 'ab12cd34-1234-4567-890a-0123456789ab'
const siteUrl = 'https://frequencylocal.com'
function destination(html: string) {
  return new URL(html.match(/href="([^"]+)"/)![1].replace(/&amp;/g, '&'))
}
describe('Email Studio delivery attribution through the pixel boundary', () => {
  it('retains the full opaque ID and distinguishes campaigns with the same old prefix', () => {
    for (const id of [campaignId, campaignId.slice(0, -1) + 'c']) {
      const url = destination(appendCampaignUtm(`<a href="${siteUrl}/community">Visit</a>`, { siteUrl, campaignId: id }))
      expect(url.searchParams.get('utm_campaign')).toBe(id)
      expect(new URLSearchParams(pixelSafeAttributionQuery(url.search)).get('utm_campaign')).toBe(id)
    }
  })
  it.each(['', 'Daniel newsletter', 'mind-body-spirit', 'person@example.test', 'email-ab12cd34'])('does not send invalid ID %j to pixels or break composition', id => {
    const url = destination(appendCampaignUtm(`<a href="${siteUrl}/community">Visit</a>`, { siteUrl, campaignId: id }))
    expect(url.searchParams.has('utm_campaign')).toBe(false)
    expect(url.searchParams.get('utm_source')).toBe('frequency')
  })
  it('preserves manual tags and keeps a human override off pixels', () => {
    const url = destination(appendCampaignUtm(`<a href="${siteUrl}/community?utm_campaign=private-persona">Visit</a>`, { siteUrl, campaignId }))
    expect(url.searchParams.get('utm_campaign')).toBe('private-persona')
    expect(new URLSearchParams(pixelSafeAttributionQuery(url.search)).has('utm_campaign')).toBe(false)
  })
  it.each(['email-ab12cd34', 'email-AB12CD34'])('preserves historical opaque %s only for the actual Email Studio source', legacy => {
    const query = `?utm_source=frequency&utm_medium=email&utm_campaign=${legacy}`
    expect(pixelSafeAttributionQuery(query)).toBe(query)
  })
  it.each(['?utm_source=google&utm_medium=cpc&utm_campaign=email-ab12cd34', '?utm_source=frequency&utm_medium=social&utm_campaign=email-ab12cd34', '?utm_source=frequency&utm_medium=email&utm_id=email-ab12cd34', '?utm_source=frequency&utm_medium=email&utm_campaign=email-ab12cd34-private'])('rejects legacy lookalikes and other contexts: %s', query => {
    const result = new URLSearchParams(pixelSafeAttributionQuery(query))
    expect(result.has('utm_campaign')).toBe(false)
    expect(result.has('utm_id')).toBe(false)
  })
  it('keeps private query values off the actual generated destination', () => {
    const url = destination(appendCampaignUtm(`<a href="${siteUrl}/community?email=person@example.test&amp;token=secret&amp;utm_term=private">Visit</a>`, { siteUrl, campaignId }))
    const safe = new URLSearchParams(pixelSafeAttributionQuery(url.search))
    expect([...safe.keys()].sort()).toEqual(['utm_campaign', 'utm_medium', 'utm_source'])
  })
})
