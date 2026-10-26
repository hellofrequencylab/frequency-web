import { describe, expect, it } from 'vitest'
import { normalizeGoogleSearchAnalytics, normalizeBingCitationSnapshot, normalizeSpaceProfileObservations, type DiscoveryImportContext } from './discovery-observations'
const now = new Date('2026-10-25T12:00:00.000Z')
const page = 'https://frequencylocal.com/spaces/makers'
function context(): DiscoveryImportContext { return {
  spaceId: 'space-A', importId: 'import-1', authorizedPageUrls: [page],
  observedAt: '2026-10-24T12:00:00.000Z', retrievedAt: '2026-10-25T11:00:00.000Z',
  period: { from: '2026-10-01T07:00:00.000Z', to: '2026-10-24T07:00:00.000Z' },
  access: { spaceId: 'space-A', authorized: true, consent: { id: 'consent-1', purpose: 'discovery_coaching', grantedAt: '2026-09-01T00:00:00.000Z', expiresAt: null, revokedAt: null } },
} }
function search(rows: unknown[], dimensions = ['page', 'query']) { return { dimensions, response: { rows } } }
function accepted(result: ReturnType<typeof normalizeGoogleSearchAnalytics>) { return result.observations.flatMap((v) => v.status === 'accepted' ? [v.observation] : []) }
describe('Google Search Analytics actual response normalization', () => {
  it('maps dimension order, sums returned page rows, weights position and discards query text', () => {
    const result = normalizeGoogleSearchAnalytics(context(), search([
      { keys: ['sensitive personal query', page], clicks: 10, impressions: 100, ctr: .1, position: 2 },
      { keys: ['second query', page], clicks: 20, impressions: 200, ctr: .1, position: 5 },
    ], ['query', 'page']), now)
    const evidence = accepted(result)
    expect(evidence.find((r) => r.metric === 'search_clicks')?.value).toBe(30)
    expect(evidence.find((r) => r.metric === 'search_ctr')?.value).toBe(.1)
    expect(evidence.find((r) => r.metric === 'average_search_position')?.value).toBe(4)
    expect(evidence.every((r) => r.coverage === 'unknown' && r.scope.spaceId === 'space-A')).toBe(true)
    expect(JSON.stringify(result)).not.toContain('sensitive personal query')
    expect(result.limitations.join(' ')).toContain('not guaranteed complete')
  })
  it('cannot import another Space page on the same hostname or an unauthorized scope', () => {
    const result = normalizeGoogleSearchAnalytics(context(), search([{ keys: ['https://frequencylocal.com/spaces/other', 'query'], clicks: 2, impressions: 20 }]), now)
    expect(result.rejectedRows).toBe(1)
    expect(result.observations).toEqual([])
    const ctx = context(); ctx.spaceId = 'space-B'
    expect(normalizeGoogleSearchAnalytics(ctx, search([]), now).error).toBe('unauthorized')
  })
  it('does not import unscoped property totals, guessed CSV shapes, duplicate rows or query URLs', () => {
    expect(normalizeGoogleSearchAnalytics(context(), search([], ['query']), now).error).toBe('unsupported_shape')
    const row = { keys: [page, 'q'], clicks: 1, impressions: 10 }
    const result = normalizeGoogleSearchAnalytics(context(), search([row, row, { ...row, keys: [`${page}?email=private@example.com`, 'q'] }]), now)
    expect(result.rejectedRows).toBe(2)
    expect(accepted(result).find((r) => r.metric === 'search_clicks')?.value).toBe(1)
  })
  it('preserves empty and unknown data without fabricating zero visibility or rank', () => {
    const empty = normalizeGoogleSearchAnalytics(context(), { dimensions: ['page'], response: {} }, now)
    expect(empty.observations).toEqual([])
    expect(empty.limitations.join(' ')).toContain('do not establish zero')
    const row = normalizeGoogleSearchAnalytics(context(), search([{ keys: [page], clicks: 0, impressions: 0, position: 0 }], ['page']), now)
    expect(accepted(row).some((v) => v.metric === 'average_search_position')).toBe(false)
  })
  it('rejects impossible metrics and bounds collection size', () => {
    const bad = normalizeGoogleSearchAnalytics(context(), search([{ keys: [page, 'q'], clicks: 10, impressions: 1 }]), now)
    expect(bad.rejectedRows).toBe(1)
    expect(normalizeGoogleSearchAnalytics(context(), search(new Array(25_001).fill({})), now).error).toBe('too_many_rows')
  })
  it('applies current consent and staleness through the shared evidence validator', () => {
    const ctx = context(); ctx.access.consent.revokedAt = '2026-10-25T00:00:00.000Z'
    const result = normalizeGoogleSearchAnalytics(ctx, search([{ keys: [page, 'q'], clicks: 3, impressions: 20 }]), now)
    expect(result.observations.every((v) => v.status === 'unavailable')).toBe(true)
    const old = context(); old.period.to = '2026-10-10T07:00:00.000Z'; old.observedAt = '2026-10-11T07:00:00.000Z'
    const stale = normalizeGoogleSearchAnalytics(old, search([{ keys: [page, 'q'], clicks: 3, impressions: 20 }]), now)
    expect(accepted(stale).every((v) => v.freshness === 'stale')).toBe(true)
    expect(accepted(stale).length).toBeGreaterThan(0)
  })
})
describe('Bing owner-mapped snapshot is explicit, not a fake live API', () => {
  it('accepts only a scoped owner snapshot and never invents clicks from citations', () => {
    const result = normalizeBingCitationSnapshot(context(), { format: 'owner_mapped_bing_citations_v1', rows: [{ pageUrl: page, citations: 20, groundingQuery: 'private query' }] }, now)
    expect(accepted(result).map((v) => v.metric)).toEqual(['ai_citations'])
    expect(accepted(result)[0].coverage).toBe('sampled')
    expect(JSON.stringify(result)).not.toContain('private query')
    expect(result.limitations.join(' ')).toContain('no live API connector')
    expect(normalizeBingCitationSnapshot(context(), { rows: [] }, now).error).toBe('unsupported_shape')
  })
})
describe('existing first-party Space aggregate adapter', () => {
  function input() { return { spaceId: 'space-A', pageUrl: page, evidence: { windowDays: 23, observedFrom: context().period.from, observedThrough: context().period.to, profileViews: null, ctaClicks: 4, attendance: { checkins: 12, people: 8, returnPeople: 3 } } } }
  it('keeps unknown profile views unknown and never divides unrelated click/check-in aggregates', () => {
    const result = normalizeSpaceProfileObservations(context(), input(), now)
    expect(result.limitations.join(' ')).toContain('profile_view_buckets is unavailable, not zero')
    expect(result.observations.some((v) => v.status === 'accepted' && v.observation.unit === 'rate')).toBe(false)
    // Coarse counts remain events, never a fabricated distinct-person sample.
    expect(accepted(result).find((v) => v.metric === 'profile_cta_clicks')).toEqual(expect.objectContaining({ countingUnit: 'events', sampleSize: null }))
    expect(accepted(result).find((v) => v.metric === 'distinct_checked_in_people')?.value).toBe(8)
  })
  it('refuses mismatched tenant/window rather than relabeling another scope', () => {
    expect(normalizeSpaceProfileObservations(context(), { ...input(), spaceId: 'space-B' }, now).error).toBe('unauthorized')
    const raw = input(); raw.evidence.observedFrom = '2020-01-01T00:00:00.000Z'
    expect(normalizeSpaceProfileObservations(context(), raw, now).error).toBe('invalid_context')
  })
})
