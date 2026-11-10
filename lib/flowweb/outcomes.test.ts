import { describe, expect, it } from 'vitest'
import { computeOutcomes, parseOutcomesRequest } from './outcomes'

const tagged = (campaign: string, content: string | null) => ({
  funnel: { utm_source: 'flowweb', utm_medium: 'founder_email', utm_campaign: campaign, utm_content: content, src: 'event_listings' },
})

describe('computeOutcomes', () => {
  it('counts leads, members, hosts and paid per campaign and draft', () => {
    const rows = computeOutcomes({
      leads: [{ meta: tagged('hnt_a', 'd-1') }, { meta: tagged('hnt_a', 'd-2') }, { meta: { funnel: { utm_source: 'google', utm_campaign: 'x' } } }, { meta: null }],
      members: [
        { id: 'p1', meta: tagged('hnt_a', 'd-1'), membership_tier: 'crew' },
        { id: 'p2', meta: tagged('hnt_a', 'd-1'), membership_tier: 'free' },
      ],
      hostIds: new Set(['p2']),
    })
    expect(rows).toEqual([
      { campaign: 'hnt_a', content: 'd-1', medium: 'founder_email', src: 'event_listings', leads: 1, members: 2, hosts: 1, paid: 1 },
      { campaign: 'hnt_a', content: 'd-2', medium: 'founder_email', src: 'event_listings', leads: 1, members: 0, hosts: 0, paid: 0 },
    ])
  })
})

describe('parseOutcomesRequest', () => {
  const now = new Date('2026-11-10T00:00:00Z')
  it('defaults to 90 days', () => {
    const r = parseOutcomesRequest({}, now)
    expect('since' in r && r.since.toISOString()).toBe('2026-08-12T00:00:00.000Z')
  })
  it('refuses a future, malformed or too-old since', () => {
    expect(parseOutcomesRequest({ since: '2027-01-01' }, now)).toHaveProperty('error')
    expect(parseOutcomesRequest({ since: 'soon' }, now)).toHaveProperty('error')
    expect(parseOutcomesRequest({ since: '2025-01-01' }, now)).toHaveProperty('error')
    expect(parseOutcomesRequest('x', now)).toHaveProperty('error')
  })
})
