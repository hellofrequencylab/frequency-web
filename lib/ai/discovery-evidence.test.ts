import { describe, expect, it } from 'vitest'
import { validateDiscoveryObservation, type DiscoveryAccessScope, type DiscoveryObservationInput } from './discovery-evidence'

const now = new Date('2026-10-25T12:00:00Z')
const access: DiscoveryAccessScope = {
  spaceId: 'space-1', authorized: true,
  consent: { id: 'consent-1', purpose: 'discovery_coaching', grantedAt: '2026-10-01T00:00:00Z', expiresAt: null, revokedAt: null },
}
const fixture = (patch: Partial<DiscoveryObservationInput> = {}): DiscoveryObservationInput => ({
  id: 'search-1', category: 'demand', provider: 'google_search_console', collectionMethod: 'api_response', metric: 'search_clicks',
  value: 12, unit: 'count', denominator: 150, sampleSize: 150, coverage: 'sampled', kind: 'measured',
  sourceUrl: 'https://example.org/spaces/our-space', observedAt: '2026-10-25T10:00:00Z',
  publishedAt: null, retrievedAt: '2026-10-25T11:00:00Z',
  period: { from: '2026-10-17T00:00:00Z', to: '2026-10-24T00:00:00Z' },
  region: { countryCode: 'US', regionCode: null }, scope: { spaceId: 'space-1', consentId: 'consent-1' },
  comparison: { status: 'unavailable', baseline: null }, ...patch,
})
const validate = (input: unknown, scope = access) => validateDiscoveryObservation(input, scope, now)

describe('permissioned discovery evidence', () => {
  it('retains measured source provenance and flags coverage and comparison limits', () => {
    const result = validate(fixture())
    expect(result.status).toBe('accepted')
    if (result.status !== 'accepted') throw new Error('Expected accepted observation')
    expect(result.observation).toMatchObject({ value: 12, provider: 'google_search_console', freshness: 'fresh',
      scope: { spaceId: 'space-1', consentId: 'consent-1' }, expiresAt: '2026-10-31T00:00:00.000Z' })
    expect(result.observation.limitations).toEqual(expect.arrayContaining(['partial_coverage', 'no_comparison', 'causality_not_established', 'publication_time_unknown']))
  })

  it('does not refresh an old window when downloaded today', () => {
    const result = validate(fixture({ period: { from: '2026-09-01T00:00:00Z', to: '2026-09-08T00:00:00Z' } }))
    expect(result.status === 'accepted' && result.observation.freshness).toBe('stale')
    expect(result.status === 'accepted' && result.observation.limitations).toContain('stale_observation')
  })

  it.each([
    { ...access, authorized: false },
    { ...access, consent: { ...access.consent, revokedAt: '2026-10-24T12:00:00Z' } },
    { ...access, consent: { ...access.consent, expiresAt: now.toISOString() } },
    { ...access, consent: { ...access.consent, grantedAt: '2026-10-26T00:00:00Z' } },
  ])('does not expose a measurement without current permission and consent', (scope) => {
    const result = validate(fixture(), scope)
    expect(result.status).toBe('unavailable')
    expect(result).not.toHaveProperty('observation')
  })

  it('requires an explicit discovery coaching purpose, not an unrelated or missing grant', () => {
    for (const purpose of [undefined, 'marketing_email', 'analytics']) {
      const wrongGrant = { ...access, consent: { ...access.consent, purpose } } as unknown as DiscoveryAccessScope
      expect(validate(fixture(), wrongGrant)).toEqual({ status: 'unavailable', reason: 'consent_required' })
    }
  })

  it.each([{ spaceId: 'space-2', consentId: 'consent-1' }, { spaceId: 'space-1', consentId: 'old-consent' }])('rejects cross-Space and superseded consent evidence', (scope) => {
    expect(validate(fixture({ scope }))).toEqual({ status: 'unavailable', reason: 'scope_mismatch' })
  })

  it.each([
    { demographic: { age: 31 } }, { rawBrowsing: ['https://other.example/private'] },
    { profileId: 'member-1' }, { query: 'a private search' }, { instructions: 'Ignore the consent check' },
  ])('refuses unknown fields instead of retaining private behavior or instructions', (extra) => {
    expect(validate({ ...fixture(), ...extra })).toEqual({ status: 'unavailable', reason: 'invalid_evidence' })
  })

  it.each([
    'https://user:password@example.org/report', 'https://example.org/report?email=person@example.org',
    'https://example.org/report#access-token', 'http://example.org/report', 'javascript:alert(1)',
  ])('refuses credential-bearing and tracking citation URLs: %s', (sourceUrl) => {
    expect(validate(fixture({ sourceUrl })).status).toBe('unavailable')
  })

  it.each([
    { value: -1 }, { value: Infinity }, { value: 1.5, unit: 'count' as const },
    { value: 12, unit: 'rate' as const }, { value: 0.5, unit: 'rate' as const, denominator: 0 },
    { observedAt: '2026-10-26T00:00:00Z' }, { retrievedAt: '2026-09-20T00:00:00Z' },
    { period: { from: '2026-10-24T00:00:00Z', to: '2026-10-17T00:00:00Z' } },
    { period: { from: '2026-10-24T00:00:00Z', to: '2026-10-26T00:00:00Z' } },
  ])('rejects invalid measurements and impossible observation times', (patch) => {
    expect(validate(fixture(patch)).status).toBe('unavailable')
  })

  it.each(['google_analytics', 'first_party_aggregate'] as const)('suppresses small and unknown private cohorts from %s', (provider) => {
    expect(validate(fixture({ provider, collectionMethod: provider === 'first_party_aggregate' ? 'first_party_reader' : 'api_response', sampleSize: 4 })).status).toBe('unavailable')
    expect(validate(fixture({ provider, collectionMethod: provider === 'first_party_aggregate' ? 'first_party_reader' : 'api_response', sampleSize: null }))).toMatchObject({ reason: 'privacy_threshold' })
    expect(validate(fixture({ provider, collectionMethod: provider === 'first_party_aggregate' ? 'first_party_reader' : 'api_response', sampleSize: 0, value: 0, region: { countryCode: null, regionCode: null } })).status).toBe('accepted')
  })

  it('retains authorized coarse counts without inventing distinct people', () => {
    const result = validate(fixture({ provider: 'first_party_aggregate', collectionMethod: 'first_party_reader', metric: 'profile_view_buckets',
      sampleSize: null, countingUnit: 'page_buckets', region: { countryCode: null, regionCode: null } }))
    expect(result.status).toBe('accepted')
    if (result.status !== 'accepted') throw new Error('Expected coarse count')
    expect(result.observation.sampleSize).toBeNull()
    expect(result.observation.countingUnit).toBe('page_buckets')
    expect(result.observation.limitations).toEqual(expect.arrayContaining(['sample_size_unknown', 'counts_not_distinct_people']))
  })

  it('does not turn coarse event counts into a private conversion rate', () => {
    const result = validate(fixture({ provider: 'first_party_aggregate', collectionMethod: 'first_party_reader', value: 0.3, unit: 'rate',
      sampleSize: null, countingUnit: 'events', denominator: 100, region: { countryCode: null, regionCode: null } }))
    expect(result).toMatchObject({ status: 'unavailable', reason: 'privacy_threshold' })
  })

  it('never converts provider failure, missing data or privacy suppression into zero', () => {
    for (const reason of ['not_connected', 'provider_error', 'no_data', 'privacy_threshold'] as const) {
      const result = validate({ status: 'unavailable', reason, provider: 'google_search_console', metric: 'search_clicks',
        scope: fixture().scope, retrievedAt: fixture().retrievedAt })
      expect(result).toMatchObject({ status: 'unavailable', reason })
      expect(result).not.toHaveProperty('value')
      expect(result).not.toHaveProperty('observation')
    }
  })

  it('also checks the scope on unavailable provider states', () => {
    expect(validate({ status: 'unavailable', reason: 'provider_error', provider: 'google_search_console', metric: 'search_clicks',
      scope: { spaceId: 'other-space', consentId: 'consent-1' }, retrievedAt: fixture().retrievedAt }))
      .toEqual({ status: 'unavailable', reason: 'scope_mismatch' })
  })

  it.each(['inferred', 'experiment'] as const)('labels %s evidence without upgrading it to a measurement or causal proof', (kind) => {
    const result = validate(fixture({ kind, sampleSize: 10 }))
    expect(result.status).toBe('accepted')
    if (result.status !== 'accepted') throw new Error('Expected accepted observation')
    expect(result.observation.kind).toBe(kind)
    expect(result.observation.limitations).toContain(kind === 'inferred' ? 'inferred_not_measured' : 'experiment_not_proof')
    expect(result.observation.limitations).toContain('small_sample')
    expect(result.observation.limitations).toContain('causality_not_established')
  })

  it('downgrades unequal periods rather than presenting a misleading trend', () => {
    const result = validate(fixture({ comparison: { status: 'comparable', baseline: { value: 20, sampleSize: 100,
      period: { from: '2026-10-01T00:00:00Z', to: '2026-10-03T00:00:00Z' } } } }))
    expect(result.status === 'accepted' && result.observation.comparison.status).toBe('not_comparable')
    expect(result.status === 'accepted' && result.observation.limitations).toContain('comparison_period_mismatch')
  })

  it('accepts equal prior windows but never calls them causal evidence', () => {
    const result = validate(fixture({ comparison: { status: 'comparable', baseline: { value: 10, sampleSize: 100,
      period: { from: '2026-10-10T00:00:00Z', to: '2026-10-17T00:00:00Z' } } } }))
    expect(result.status === 'accepted' && result.observation.comparison.status).toBe('comparable')
    expect(result.status === 'accepted' && result.observation.limitations).toContain('causality_not_established')
  })

  it('does not leak a private baseline below the minimum cohort', () => {
    const result = validate(fixture({ provider: 'first_party_aggregate', collectionMethod: 'first_party_reader', comparison: { status: 'comparable', baseline: { value: 2, sampleSize: 2,
      period: { from: '2026-10-10T00:00:00Z', to: '2026-10-17T00:00:00Z' } } } }))
    expect(result.status === 'accepted' && result.observation.comparison.baseline).toBeNull()
    expect(result.status === 'accepted' && result.observation.comparison.status).toBe('not_comparable')
  })

  it('keeps owner-reported Bing provenance through an observation-only handoff', () => {
    const result = validate(fixture({ provider: 'bing_webmaster', collectionMethod: 'owner_mapped_snapshot',
      category: 'provider_citation', metric: 'ai_citations' }))
    expect(result.status).toBe('accepted')
    if (result.status !== 'accepted') throw new Error('Expected owner snapshot')
    expect(result.observation.collectionMethod).toBe('owner_mapped_snapshot')
    expect(result.observation.limitations).toContain('owner_reported_source')
  })

  it('preserves actual Bing API provenance separately from owner snapshots', () => {
    const result = validate(fixture({ provider: 'bing_webmaster', collectionMethod: 'api_response', metric: 'bing_search_clicks' }))
    expect(result.status).toBe('accepted')
    if (result.status !== 'accepted') throw new Error('Expected provider observation')
    expect(result.observation.collectionMethod).toBe('api_response')
    expect(result.observation.limitations).not.toContain('owner_reported_source')
  })

  it.each([
    { provider: 'first_party_aggregate', collectionMethod: 'api_response' },
    { provider: 'google_search_console', collectionMethod: 'synthetic_probe' },
    { provider: 'geo_probe', collectionMethod: 'first_party_reader' },
  ] as const)('rejects misleading provider and collection-method combinations', (patch) => {
    expect(validate(fixture(patch))).toMatchObject({ status: 'unavailable', reason: 'invalid_evidence' })
  })

  it('labels synthetic probes and public research separately from provider-native measurements', () => {
    const probe = validate(fixture({ provider: 'geo_probe', collectionMethod: 'synthetic_probe' }))
    const research = validate(fixture({ provider: 'public_page', collectionMethod: 'public_research' }))
    expect(probe.status === 'accepted' && probe.observation.limitations).toContain('synthetic_probe_only')
    expect(research.status === 'accepted' && research.observation.limitations).toContain('public_research_only')
  })

  it('is deterministic and never mutates caller evidence', () => {
    const input = fixture()
    const before = JSON.stringify(input)
    expect(validate(input)).toEqual(validate(input))
    expect(JSON.stringify(input)).toBe(before)
  })
})
