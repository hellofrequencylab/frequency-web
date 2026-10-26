import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
import { observeSpaceDiscovery, type DiscoveryObservationDependencies } from './discovery-observation-service'
const now = new Date('2026-10-25T12:00:00.000Z')
const page = 'https://frequencylocal.com/spaces/makers'
let deps: { [K in keyof DiscoveryObservationDependencies]: ReturnType<typeof vi.fn<DiscoveryObservationDependencies[K]>> }
const evidence = { windowDays: 23, observedFrom: '2026-10-01T07:00:00.000Z', observedThrough: '2026-10-24T07:00:00.000Z', profileViews: 20, ctaClicks: 8 }
beforeEach(() => {
  deps = {
    authorize: vi.fn().mockResolvedValue({ spaceId: 'A', actorProfileId: 'owner-A', canEditProfile: true }),
    resolveConsent: vi.fn().mockResolvedValue({ spaceId: 'A', actorProfileId: 'owner-A', consent: { id: 'consent-A', purpose: 'discovery_coaching', grantedAt: '2026-09-01T00:00:00.000Z', expiresAt: null, revokedAt: null } }),
    resolvePages: vi.fn().mockResolvedValue({ spaceId: 'A', primaryPageUrl: page, authorizedPageUrls: [page] }),
    readAggregates: vi.fn().mockResolvedValue({ spaceId: 'A', pageUrl: page, evidence, owner: { audience: 'New guests', voice: 'Plain', goal: 'attendance' } }),
  }
})
function noReaders() { expect(deps.resolvePages).not.toHaveBeenCalled(); expect(deps.readAggregates).not.toHaveBeenCalled() }
describe('server discovery orchestration authority', () => {
  it.each([null, { spaceId: 'B', actorProfileId: 'owner-A', canEditProfile: true }, { spaceId: 'A', actorProfileId: 'staff', canEditProfile: false }])('denies anonymous, foreign tenant and read-only staff before consent or readers', async (actor) => {
    deps.authorize.mockResolvedValue(actor)
    expect(await observeSpaceDiscovery('A', deps, now)).toEqual({ status: 'unavailable', reason: 'permission_denied' })
    expect(deps.resolveConsent).not.toHaveBeenCalled(); noReaders()
  })
  it.each(['missing', 'wrong_purpose', 'revoked', 'expired', 'future_grant', 'foreign_space', 'other_actor'])('requires current scoped consent before readers (%s)', async (variant) => {
    const grant = await deps.resolveConsent('A', 'owner-A'); deps.resolveConsent.mockClear()
    if (variant === 'missing') deps.resolveConsent.mockResolvedValue(null)
    else {
      const edited = JSON.parse(JSON.stringify(grant))
      if (variant === 'wrong_purpose') edited.consent.purpose = 'analytics'
      if (variant === 'revoked') edited.consent.revokedAt = '2026-10-24T00:00:00.000Z'
      if (variant === 'expired') edited.consent.expiresAt = now.toISOString()
      if (variant === 'future_grant') edited.consent.grantedAt = '2027-01-01T00:00:00.000Z'
      if (variant === 'foreign_space') edited.spaceId = 'B'
      if (variant === 'other_actor') edited.actorProfileId = 'owner-B'
      deps.resolveConsent.mockResolvedValue(edited)
    }
    expect(await observeSpaceDiscovery('A', deps, now)).toEqual({ status: 'unavailable', reason: 'consent_required' })
    noReaders()
  })
  it('runs the real normalizer and coach only after permission, current consent and owned pages', async () => {
    const result = await observeSpaceDiscovery('A', deps, now)
    expect(result.status).toBe('completed')
    expect(deps.authorize.mock.invocationCallOrder[0]).toBeLessThan(deps.resolveConsent.mock.invocationCallOrder[0])
    expect(deps.resolveConsent.mock.invocationCallOrder[0]).toBeLessThan(deps.resolvePages.mock.invocationCallOrder[0])
    expect(deps.resolvePages.mock.invocationCallOrder[0]).toBeLessThan(deps.readAggregates.mock.invocationCallOrder[0])
    expect(deps.resolveConsent).toHaveBeenCalledExactlyOnceWith('A', 'owner-A')
    if (result.status !== 'completed') return
    expect(result.coaching.authorship).toBe('human')
    expect(result.coaching.recommendations.length).toBeGreaterThan(0)
    expect(JSON.stringify(result.coaching)).toContain('page_buckets')
    expect(result.coaching.recommendations.every((r) => r.evidence.unit === 'count')).toBe(true)
    expect(JSON.stringify(result)).toContain('Do not derive a person conversion rate')
  })
  it('re-authorizes each request so an earlier success cannot authorize a later revoked session', async () => {
    await observeSpaceDiscovery('A', deps, now)
    deps.authorize.mockResolvedValue(null); deps.readAggregates.mockClear(); deps.resolveConsent.mockClear(); deps.resolvePages.mockClear()
    expect((await observeSpaceDiscovery('A', deps, now)).status).toBe('unavailable')
    expect(deps.authorize).toHaveBeenCalledTimes(2)
    expect(deps.resolveConsent).not.toHaveBeenCalled(); noReaders()
  })
  it('rejects foreign page ownership before loading private aggregate metrics', async () => {
    deps.resolvePages.mockResolvedValue({ spaceId: 'B', primaryPageUrl: page, authorizedPageUrls: [page] })
    expect(await observeSpaceDiscovery('A', deps, now)).toEqual({ status: 'unavailable', reason: 'invalid_context' })
    expect(deps.readAggregates).not.toHaveBeenCalled()
  })
  it('does not relabel another tenant aggregate as owned evidence', async () => {
    deps.readAggregates.mockResolvedValue({ spaceId: 'B', pageUrl: page, evidence, owner: { audience: 'Private B', voice: 'Private B', goal: 'attendance' } })
    expect(await observeSpaceDiscovery('A', deps, now)).toEqual({ status: 'unavailable', reason: 'source_unavailable' })
  })
  it('turns reader errors into unavailable, never measured zero', async () => {
    deps.readAggregates.mockRejectedValue(new Error('database unavailable'))
    expect(await observeSpaceDiscovery('A', deps, now)).toEqual({ status: 'unavailable', reason: 'source_unavailable' })
  })
})


it('does not accept a client-supplied access or consent object as a request authority', async () => {
  const forged = { spaceId: 'A', authorized: true, consent: { purpose: 'discovery_coaching' } }
  expect(await observeSpaceDiscovery(forged as unknown as string, deps, now)).toEqual({ status: 'unavailable', reason: 'invalid_context' })
  expect(deps.authorize).not.toHaveBeenCalled()
  noReaders()
})

it('evaluates a fresh reader snapshot after reading, rather than marking it future-dated at request start', async () => {
  vi.useFakeTimers()
  vi.setSystemTime(now)
  try {
    deps.readAggregates.mockImplementation(async () => {
      const finished = new Date(now.getTime() + 1000)
      vi.setSystemTime(finished)
      return { spaceId: 'A', pageUrl: page, evidence: { ...evidence, observedThrough: finished.toISOString() }, owner: { audience: 'New guests', voice: 'Plain', goal: 'attendance' } }
    })
    const result = await observeSpaceDiscovery('A', deps)
    expect(result.status).toBe('completed')
    if (result.status === 'completed') expect(result.coaching.recommendations.length).toBeGreaterThan(0)
  } finally { vi.useRealTimers() }
})
