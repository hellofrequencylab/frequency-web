import { beforeEach, describe, expect, it, vi } from 'vitest'
const m = vi.hoisted(() => ({ profile: vi.fn(), space: vi.fn(), caps: vi.fn(), stage: vi.fn(), activate: vi.fn(), status: vi.fn(), add: vi.fn(), refresh: vi.fn(), revalidate: vi.fn(), detach: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: m.revalidate }))
vi.mock('@/lib/auth', () => ({ getCallerProfile: m.profile }))
vi.mock('@/lib/spaces/store', () => ({ getVisibleSpaceBySlug: m.space, stageSpaceDomain: m.stage, activateSpaceDomain: m.activate }))
vi.mock('@/lib/spaces/entitlements', () => ({ getSpaceCapabilities: m.caps, spaceCanUseFullWebsite: () => true, spaceHasEntitlement: () => true }))
vi.mock('@/lib/sites/site-cache', () => ({ refreshSite: m.refresh }))
vi.mock('@/lib/sites/chapter-hosts', () => ({ attachChapterHosts: vi.fn() }))
vi.mock('@/lib/sites/vercel-domains', () => ({ siteDomainStatus: m.status, vercelDomainsConfigured: () => true, addSiteDomain: m.add, removeSiteDomain: m.detach }))
vi.mock('@/lib/pricing/gates', () => ({ featureAllowed: async () => true }))
vi.mock('@/lib/pricing/settings', () => ({ featureGatesLive: async () => false }))
import { connectSiteDomain, checkSiteDomain, removeSiteDomain } from '@/app/(main)/spaces/[slug]/manage/layout/actions'
let active: string | null
let candidate: string | null
const pending = { attached: true, verified: false, dnsReady: false, secure: false, records: [] }
beforeEach(() => {
  vi.clearAllMocks(); active = null; candidate = null
  m.profile.mockResolvedValue({ id: 'owner' })
  m.caps.mockResolvedValue({ canEditProfile: true })
  m.space.mockImplementation(async () => ({ id: 'space-A', slug: 'makers', domain: active, plan: 'collective', preferences: candidate ? { siteDomainSetup: { domain: candidate } } : {} }))
  m.stage.mockImplementation(async (_id, domain) => { candidate = domain; return true })
  m.activate.mockImplementation(async (_id, domain, previous) => { if (candidate !== domain || active !== previous) return 'stale'; active = domain; return 'ok' })
  m.status.mockResolvedValue(pending); m.add.mockResolvedValue({ ok: true }); m.detach.mockResolvedValue({ ok: true })
})
describe('domain setup never disables a working address before readiness', () => {
  it('stages an unready domain without active binding or canonical invalidation', async () => {
    expect(await connectSiteDomain('makers', 'pending.example.com')).toEqual({ data: { domain: 'pending.example.com', ...pending } })
    expect(candidate).toBe('pending.example.com'); expect(active).toBeNull()
    expect(m.activate).not.toHaveBeenCalled(); expect(m.refresh).not.toHaveBeenCalled()
  })
  it('keeps the previous active domain while a replacement is pending and when setup is cancelled', async () => {
    active = 'working.example.com'
    await connectSiteDomain('makers', 'pending.example.com')
    expect(active).toBe('working.example.com')
    await removeSiteDomain('makers')
    expect(active).toBe('working.example.com'); expect(candidate).toBeNull()
    expect(m.detach).toHaveBeenCalledExactlyOnceWith('pending.example.com')
  })
  it.each(['attached', 'verified', 'dnsReady', 'secure'] as const)('does not promote while %s is false', async (key) => {
    candidate = 'pending.example.com'
    m.status.mockResolvedValue({ attached: true, verified: true, dnsReady: true, secure: true, records: [], [key]: false })
    await checkSiteDomain('makers')
    expect(active).toBeNull(); expect(m.activate).not.toHaveBeenCalled()
  })
  it('promotes only a fully ready candidate and refreshes the canonical after promotion', async () => {
    active = 'working.example.com'; candidate = 'ready.example.com'
    m.status.mockResolvedValue({ attached: true, verified: true, dnsReady: true, secure: true, records: [] })
    await checkSiteDomain('makers')
    expect(active).toBe('ready.example.com')
    expect(m.activate).toHaveBeenCalledExactlyOnceWith('space-A', 'ready.example.com', 'working.example.com')
    expect(m.activate.mock.invocationCallOrder[0]).toBeLessThan(m.refresh.mock.invocationCallOrder[0])
  })
  it('refuses a stale ready response when a different candidate was selected', async () => {
    candidate = 'old.example.com'; active = 'working.example.com'
    m.status.mockImplementation(async () => { candidate = 'new.example.com'; return { attached: true, verified: true, dnsReady: true, secure: true, records: [] } })
    expect(await checkSiteDomain('makers')).toHaveProperty('error')
    expect(active).toBe('working.example.com'); expect(m.refresh).not.toHaveBeenCalled()
  })
  it('rechecks permission after provider IO before any activation', async () => {
    candidate = 'ready.example.com'
    m.status.mockImplementation(async () => { m.caps.mockResolvedValue({ canEditProfile: false }); return { attached: true, verified: true, dnsReady: true, secure: true, records: [] } })
    expect(await checkSiteDomain('makers')).toHaveProperty('error')
    expect(m.activate).not.toHaveBeenCalled()
  })
  it('fails before hosting writes when candidate storage fails', async () => {
    m.stage.mockResolvedValue(false)
    expect(await connectSiteDomain('makers', 'pending.example.com')).toHaveProperty('error')
    expect(m.add).not.toHaveBeenCalled(); expect(active).toBeNull()
  })
  it('does not reinterpret an existing legacy active binding as pending or remove it on a failed check', async () => {
    active = 'legacy.example.com'
    await checkSiteDomain('makers')
    expect(active).toBe('legacy.example.com'); expect(m.activate).not.toHaveBeenCalled()
  })
})
