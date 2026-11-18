import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OG_SITE, ROOT_OG_IMAGES } from '@/lib/site'
import TrailLanding, { dynamic, generateMetadata } from './page'

const mocks = vi.hoisted(() => ({
  getMyProfileId: vi.fn(),
  headers: vi.fn(),
  loadPublicTrailSummary: vi.fn(),
  loadScanPlacement: vi.fn(),
  openClaim: vi.fn(),
  openTeamClaim: vi.fn(),
}))

vi.mock('next/headers', () => ({ headers: mocks.headers }))
vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NOT_FOUND') },
  usePathname: () => '/play/coast-trail',
}))
vi.mock('@/lib/page-settings/store', () => ({
  getPageHeaderImage: vi.fn(),
  getPageHeaderFocus: vi.fn(),
}))
vi.mock('@/lib/elements/header', () => ({
  resolveHeaderElement: vi.fn(async () => ({ height: 'standard', overlayStyle: 'shadow' })),
}))
vi.mock('@/lib/auth', () => ({ getMyProfileId: mocks.getMyProfileId }))
vi.mock('@/lib/hunts/run-store', () => ({ loadPublicTrailSummary: mocks.loadPublicTrailSummary }))
vi.mock('@/lib/hunts/team-store', () => ({ openTeamClaim: mocks.openTeamClaim }))
vi.mock('@/lib/hunts/claim-store', () => ({
  loadScanPlacement: mocks.loadScanPlacement,
  openClaim: mocks.openClaim,
}))

const trail = {
  slug: 'coast-trail',
  title: 'Coast Trail',
  description: 'Explore the coast on foot.',
  stopCount: 3,
}
const placement = { id: 'placement-1', huntId: 'hunt-1', huntSlug: trail.slug, revokedAt: null }
const params = Promise.resolve({ slug: trail.slug })
const render = async (p?: string | string[], claim?: string | string[]) => renderToStaticMarkup(await TrailLanding({
  params,
  searchParams: Promise.resolve({ p, claim }),
}))

beforeEach(() => {
  vi.stubEnv('HUNTS_ENABLED', 'on')
  vi.stubEnv('HUNTS_CLAIMS_ENABLED', 'on')
  mocks.headers.mockResolvedValue(new Headers({ 'user-agent': 'Mozilla/5.0 (iPhone) Safari' }))
  mocks.getMyProfileId.mockResolvedValue(null)
  mocks.loadPublicTrailSummary.mockResolvedValue(trail)
  mocks.loadScanPlacement.mockResolvedValue(placement)
  mocks.openClaim.mockResolvedValue({ ok: true, runId: 'private-run-id', token: 'signed-fixture' })
  mocks.openTeamClaim.mockResolvedValue(null)
})

afterEach(() => {
  vi.resetAllMocks()
  vi.unstubAllEnvs()
})

describe('Public Trail landing', () => {
  it('404s while Hunts are dark or the summary is unavailable', async () => {
    vi.stubEnv('HUNTS_ENABLED', '')
    await expect(render()).rejects.toThrow('NOT_FOUND')
    expect(mocks.loadPublicTrailSummary).not.toHaveBeenCalled()

    vi.stubEnv('HUNTS_ENABLED', 'on')
    mocks.loadPublicTrailSummary.mockResolvedValue(null)
    await expect(render()).rejects.toThrow('NOT_FOUND')
    expect(mocks.getMyProfileId).not.toHaveBeenCalled()
  })

  it('renders the public fixture and clean sign-in destination to an anonymous visitor', async () => {
    const html = await render('coast-001')
    expect(html).toContain('Coast Trail')
    expect(html).toContain('Explore the coast on foot.')
    expect(html).toContain('3 stops')
    expect(html).toContain('Sign in to play')
    expect(html).toContain('/sign-in?next=%2Fhunts%2Fcoast-trail%2Fplay')
    expect(html).not.toMatch(/<form|coast-001|signed-fixture|private-run-id/)
    expect(mocks.loadScanPlacement).not.toHaveBeenCalled()
    expect(mocks.openClaim).not.toHaveBeenCalled()
  })

  it('serves the same public fixture to a crawler even with an authenticated profile', async () => {
    mocks.headers.mockResolvedValue(new Headers({ 'user-agent': 'Slackbot-LinkExpanding 1.0' }))
    mocks.getMyProfileId.mockResolvedValue('player-1')

    const html = await render('coast-001')
    expect(html).toContain('Sign in to play')
    expect(html).not.toMatch(/<form|coast-001|signed-fixture|private-run-id/)
    expect(mocks.getMyProfileId).not.toHaveBeenCalled()
    expect(mocks.loadScanPlacement).not.toHaveBeenCalled()
    expect(mocks.openClaim).not.toHaveBeenCalled()
  })

  it('offers one same-site confirmation form with only the signed token for an eligible player', async () => {
    mocks.getMyProfileId.mockResolvedValue('player-1')
    const html = await render('coast-001')
    expect(html).toContain('<form action="/hunts/p/coast-001" method="post">')
    expect(html.match(/<form\b/g)).toHaveLength(1)
    expect(html.match(/<input\b[^>]*>/g)).toEqual([
      expect.stringMatching(/type="hidden".*name="token".*value="signed-fixture"/),
    ])
    expect(html).toContain('Confirm stop')
    expect(html).not.toMatch(/private-run-id|placement-1|hunt-1|name="idempotency/)
    expect(mocks.loadScanPlacement).toHaveBeenCalledWith({ code: 'coast-001' })
    expect(mocks.openClaim).toHaveBeenCalledWith('player-1', 'placement-1', expect.any(Number))
  })

  it('keeps another Trail or a revoked placement off the claim path', async () => {
    mocks.getMyProfileId.mockResolvedValue('player-1')
    mocks.loadScanPlacement.mockResolvedValueOnce({ ...placement, huntSlug: 'other-trail' })
    mocks.loadScanPlacement.mockResolvedValueOnce({ ...placement, revokedAt: '2026-11-10T18:30:00Z' })
    for (const code of ['other-001', 'coast-001']) {
      expect(await render(code)).not.toMatch(/<form|signed-fixture/)
    }
    expect(mocks.openClaim).not.toHaveBeenCalled()
  })

  it('keeps placement lookup off with disabled claims or ambiguous input', async () => {
    mocks.getMyProfileId.mockResolvedValue('player-1')
    expect(await render(['coast-001', 'coast-002'])).not.toContain('<form')
    vi.stubEnv('HUNTS_CLAIMS_ENABLED', '')
    expect(await render('coast-001')).not.toContain('<form')
    expect(mocks.loadScanPlacement).not.toHaveBeenCalled()
    expect(mocks.openClaim).not.toHaveBeenCalled()
  })

  it('falls back to the player entry point when the claim adapter refuses to issue a token', async () => {
    mocks.getMyProfileId.mockResolvedValue('player-1')
    mocks.openClaim.mockResolvedValue({ ok: false, reason: 'no_run' })
    const html = await render('coast-001')
    expect(html).toContain('href="/hunts/coast-trail/play"')
    expect(html).not.toMatch(/<form|coast-001|signed-fixture|no_run/)
  })

  it('shows only recognized result messages to signed-in humans', async () => {
    expect(await render(undefined, 'credited')).not.toContain('role="status"')

    mocks.getMyProfileId.mockResolvedValue('player-1')
    expect(await render(undefined, 'credited')).toContain('Stop confirmed.')
    expect(await render(undefined, 'already_credited')).toContain('You already confirmed this stop.')
    expect(await render(undefined, 'unavailable')).toContain('This stop could not be confirmed.')
    // FH-020V: a kept visit thanks the player and says what happens next, with no blame and no credit claim.
    const held = await render(undefined, 'held')
    expect(held).toContain('We saved your visit, and someone on the Trail team will check it.')
    expect(held).not.toMatch(/Stop confirmed\.|could not|denied|failed|wrong|—/)
    expect(await render(undefined, 'unknown')).not.toContain('role="status"')
    expect(await render(undefined, ['credited', 'unavailable'])).not.toContain('role="status"')

    mocks.headers.mockResolvedValue(new Headers({ 'user-agent': 'Googlebot' }))
    expect(await render(undefined, 'credited')).not.toContain('role="status"')
  })

  it('hands a locked team member a token for the team run, not their own (FH-043S)', async () => {
    mocks.getMyProfileId.mockResolvedValue('player-2')
    mocks.openTeamClaim.mockResolvedValue({ token: 'team-signed-fixture' })
    const html = await render('coast-001')
    expect(html).toContain('<form action="/hunts/p/coast-001" method="post">')
    expect(html.match(/<input\b[^>]*>/g)).toEqual([
      expect.stringMatching(/type="hidden".*name="token".*value="team-signed-fixture"/),
    ])
    expect(html).toContain('Confirm stop for your team')
    expect(mocks.openTeamClaim).toHaveBeenCalledWith('player-2', 'coast-001', expect.any(Number))
    expect(mocks.openClaim).not.toHaveBeenCalled()
  })

  it('words the team answers from the scan POST', async () => {
    mocks.getMyProfileId.mockResolvedValue('player-2')
    expect(await render(undefined, 'team_credited')).toContain('Stop confirmed for your team.')
    expect(await render(undefined, 'team_already_credited')).toContain('Your team already has this stop.')
    expect(await render(undefined, 'team_not_locked')).toContain('Your captain needs to lock the roster before stops count.')
  })

  it('sends a Mystery answer to the Trail page (FH-042S)', async () => {
    mocks.getMyProfileId.mockResolvedValue('player-1')
    expect(await render(undefined, 'answer')).toContain('This stop asks a question. Open the Trail to answer it with the code.')
    expect(await render(undefined, 'answer_locked')).toContain('That was the last try for this question.')
  })

  it('uses request-time rendering and only public Trail data in OG metadata', async () => {
    expect(dynamic).toBe('force-dynamic')
    expect(await generateMetadata({ params })).toEqual({
      title: trail.title,
      description: trail.description,
      openGraph: { ...OG_SITE, title: trail.title, description: trail.description, images: ROOT_OG_IMAGES },
      robots: { index: false, follow: false },
      referrer: 'strict-origin',
    })
    expect(mocks.getMyProfileId).not.toHaveBeenCalled()
    expect(mocks.loadScanPlacement).not.toHaveBeenCalled()
    expect(mocks.openClaim).not.toHaveBeenCalled()
  })
})
