import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  normalizeUtmValue,
  deriveSourceTag,
  buildTrackedUrl,
  composeLink,
  EMPTY_UTM,
  type UtmParams,
} from './link-compose'

const utm = (over: Partial<UtmParams> = {}): UtmParams => ({ ...EMPTY_UTM, ...over })

describe('normalizeUtmValue', () => {
  it('lowercases, hyphenates spaces, and strips unsafe characters', () => {
    expect(normalizeUtmValue('  Spring Launch! ')).toBe('spring-launch')
    expect(normalizeUtmValue('Email/Blast')).toBe('emailblast')
    expect(normalizeUtmValue('a  b   c')).toBe('a-b-c')
  })

  it('collapses repeats and trims leading/trailing separators', () => {
    expect(normalizeUtmValue('--news--')).toBe('news')
    expect(normalizeUtmValue('a--b')).toBe('a-b')
    expect(normalizeUtmValue('.q4.')).toBe('q4')
  })

  it('caps the length so a hostile input cannot store an unbounded value', () => {
    expect(normalizeUtmValue('a'.repeat(200))).toHaveLength(60)
  })
})

describe('deriveSourceTag', () => {
  it('prefers campaign, then source, then empty', () => {
    expect(deriveSourceTag(utm({ campaign: 'Spring Launch', source: 'news' }))).toBe('spring-launch')
    expect(deriveSourceTag(utm({ source: 'Newsletter' }))).toBe('newsletter')
    expect(deriveSourceTag(utm())).toBe('')
  })
})

describe('buildTrackedUrl', () => {
  it('appends normalized, non-empty UTM params to an absolute URL', () => {
    const out = buildTrackedUrl('https://example.com/offer', utm({ source: 'Newsletter', medium: 'Email' }))
    const u = new URL(out)
    expect(u.searchParams.get('utm_source')).toBe('newsletter')
    expect(u.searchParams.get('utm_medium')).toBe('email')
    expect(u.searchParams.has('utm_campaign')).toBe(false) // empty omitted
  })

  it('preserves an existing query and keeps a site-relative path relative', () => {
    const out = buildTrackedUrl('/events/spring?ref=x', utm({ campaign: 'launch' }))
    expect(out.startsWith('/events/spring')).toBe(true)
    expect(out).toContain('ref=x')
    expect(out).toContain('utm_campaign=launch')
    expect(out).not.toContain('x.invalid') // dummy origin stripped back off
  })

  it('never overwrites a utm_* the operator already typed into the target', () => {
    const out = buildTrackedUrl('https://example.com?utm_source=hand', utm({ source: 'auto' }))
    expect(new URL(out).searchParams.get('utm_source')).toBe('hand')
  })

  it('returns the input unchanged when no UTM is set', () => {
    expect(buildTrackedUrl('https://example.com/x', utm())).toBe('https://example.com/x')
  })
})

describe('composeLink', () => {
  it('composes a valid input into the row fields the action persists', () => {
    const res = composeLink({
      title: '  Spring email  ',
      target: 'https://example.com/offer',
      utm: utm({ campaign: 'Spring Launch', source: 'news' }),
    })
    expect(typeof res).not.toBe('string')
    if (typeof res === 'string') throw new Error(res)
    expect(res.title).toBe('Spring email')
    expect(res.trackedUrl).toContain('utm_campaign=spring-launch')
    expect(res.sourceTag).toBe('spring-launch')
  })

  it('stores a null source tag when no campaign or source is set', () => {
    const res = composeLink({ title: 'Bare link', target: '/feed', utm: utm() })
    if (typeof res === 'string') throw new Error(res)
    expect(res.sourceTag).toBeNull()
    expect(res.trackedUrl).toBe('/feed')
  })

  it('rejects an empty title, empty target, and an invalid destination (voice-compliant, no em dashes)', () => {
    expect(composeLink({ title: '', target: 'https://x.com', utm: utm() })).toBe('Give the link a title.')
    expect(composeLink({ title: 'T', target: '   ', utm: utm() })).toBe('Enter the destination URL.')
    const bad = composeLink({ title: 'T', target: 'javascript:alert(1)', utm: utm() })
    expect(typeof bad).toBe('string')
    expect(bad as string).not.toMatch(/[—–]/)
  })
})

// ── Authz guard on the server action ────────────────────────────────────────────────
//
// generateLink MUST reject an unauthorized caller before any write (the admin client
// bypasses RLS, so the server-side guard is the authority). requireAdmin throws on a
// failed staff/role check; assert the action propagates that rather than reaching the DB.

vi.mock('@/lib/admin/guard', () => ({
  requireAdmin: vi.fn(),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => {
    throw new Error('DB must not be reached for an unauthorized caller')
  }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
// Keep this test free of the `qrcode` dependency: the action statically imports the
// styled renderer, but neither the authz nor the invalid-compose path ever renders a QR.
vi.mock('@/lib/qr/render-styled', () => ({ renderStyledQrSvg: vi.fn(() => '<svg/>') }))

describe('generateLink authz', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('throws (no write) when requireAdmin denies the caller', async () => {
    const { requireAdmin } = await import('@/lib/admin/guard')
    vi.mocked(requireAdmin).mockRejectedValueOnce(new Error('Unauthorized'))

    const { generateLink } = await import('@/app/(main)/admin/growth/links/actions')
    await expect(
      generateLink({ title: 'X', target: 'https://x.com', utm: EMPTY_UTM }),
    ).rejects.toThrow('Unauthorized')

    // The guard is checked with the SAME staff capability the QR surface uses.
    expect(requireAdmin).toHaveBeenCalledWith('host', { staff: 'qr' })
  })

  it('rejects an invalid compose without writing, even for an authorized caller', async () => {
    const { requireAdmin } = await import('@/lib/admin/guard')
    vi.mocked(requireAdmin).mockResolvedValueOnce({
      profileId: 'p1',
      role: 'host',
      webRole: 'admin',
      staffRole: null,
    } as Awaited<ReturnType<typeof requireAdmin>>)

    const { generateLink } = await import('@/app/(main)/admin/growth/links/actions')
    const res = await generateLink({ title: '', target: 'https://x.com', utm: EMPTY_UTM })
    expect(res).toEqual({ error: 'Give the link a title.' })
    // createAdminClient throws if called; reaching here proves the write was never attempted.
  })
})
