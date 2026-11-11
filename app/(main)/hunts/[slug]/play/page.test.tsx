import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { draftToGraph, publishRows } from '@/lib/hunts/draft'
import PlayPage from './page'

const store = vi.hoisted(() => ({
  getMyProfileId: vi.fn(),
  loadPlayerRun: vi.fn(),
  loadPublishedTrail: vi.fn(),
  loadRunCredits: vi.fn(),
  startOrResumeRun: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({ getMyProfileId: store.getMyProfileId }))
vi.mock('@/lib/hunts/run-store', () => store)
vi.mock('@/components/templates', () => ({ FocusTemplate: ({ children }: { children: ReactNode }) => <main>{children}</main> }))
vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NOT_FOUND') },
  redirect: (to: string) => { throw new Error(to) },
}))

const draft = {
  title: 'Coast Trail', hook: 'Get outside', area: 'The coast', audience: 'Everyone',
  routeTestedAtRevision: 1, permissionConfirmed: true,
  stops: [1, 2, 3].map((position) => ({
    place: `Place ${position}`, clue: `Clue ${position}`, hint: `Private hint ${position}`, placementReady: true,
  })),
}
const trail = {
  huntId: 'hunt-1', versionId: 'version-1', huntState: 'published', revision: 1, title: draft.title,
  graph: draftToGraph(draft), content: publishRows(draft).missions,
}
const run = { runId: 'run-1', state: 'active' }
const render = async (hint?: string | string[]) => renderToStaticMarkup(await PlayPage({
  params: Promise.resolve({ slug: 'coast-trail' }), searchParams: Promise.resolve({ hint }),
}))

beforeEach(() => {
  vi.stubEnv('HUNTS_ENABLED', 'on')
  vi.stubEnv('HUNTS_CLAIMS_ENABLED', 'on')
  store.getMyProfileId.mockResolvedValue('player-1')
  store.loadPublishedTrail.mockResolvedValue(trail)
  store.loadRunCredits.mockResolvedValue([])
  store.startOrResumeRun.mockResolvedValue(run)
  store.loadPlayerRun.mockResolvedValue(run)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetAllMocks()
})

describe('Trail player hint reveal', () => {
  it('offers a hint for the current stop without putting its text or future clues in the page', async () => {
    const html = await render()
    expect(html).toContain('Clue 1')
    expect(html).toContain('Show hint')
    expect(html).toContain('/hunts/coast-trail/play?hint=stop-1')
    expect(html).not.toMatch(/Private hint|Clue [23]|Place [123]/)
  })

  it('reveals the current hint with a read-only lookup for this profile and version', async () => {
    const html = await render('stop-1')
    expect(html).toContain('Hint: Private hint 1')
    expect(html).not.toMatch(/Private hint [23]|Clue [23]|Place [123]/)
    expect(store.loadPlayerRun).toHaveBeenCalledWith(trail, 'player-1')
    expect(store.loadRunCredits).toHaveBeenCalledWith(run.runId, 'player-1')
    expect(store.startOrResumeRun).not.toHaveBeenCalled()
  })

  it.each<[string | string[]]>([['stop-2'], ['missing'], [['stop-1', 'stop-2']]])('hides hints for an ineligible or ambiguous request', async (hint) => {
    expect(await render(hint)).not.toMatch(/Private hint|Clue [23]|Place [123]/)
    expect(store.startOrResumeRun).not.toHaveBeenCalled()
  })

  it('moves the reveal forward with the recorded credits and preserves the visited stop', async () => {
    store.loadRunCredits.mockResolvedValue([{ mission_key: 'stop-1' }])
    const html = await render('stop-2')
    expect(html).toContain('Place 1')
    expect(html).toContain('Hint: Private hint 2')
    expect(html).not.toMatch(/Private hint [13]|Clue 3|Place [23]/)
  })

  it('keeps a crafted hint request read-only when the player has no run', async () => {
    store.loadPlayerRun.mockResolvedValue(null)
    expect(await render('stop-1')).not.toMatch(/Show hint|Private hint/)
    expect(store.startOrResumeRun).not.toHaveBeenCalled()
    expect(store.loadRunCredits).not.toHaveBeenCalled()
  })

  it('hides reveal when claims are disabled or the Hunt is paused', async () => {
    vi.stubEnv('HUNTS_CLAIMS_ENABLED', '')
    expect(await render('stop-1')).not.toMatch(/Show hint|Private hint/)
    vi.stubEnv('HUNTS_CLAIMS_ENABLED', 'on')
    store.loadPublishedTrail.mockResolvedValue({ ...trail, huntState: 'paused' })
    expect(await render('stop-1')).not.toMatch(/Show hint|Private hint/)
  })

  it('redirects a signed-out request before looking up a run', async () => {
    store.getMyProfileId.mockResolvedValue(null)
    await expect(render('stop-1')).rejects.toThrow('/sign-in?next=/hunts/coast-trail/play')
    expect(store.loadPlayerRun).not.toHaveBeenCalled()
    expect(store.startOrResumeRun).not.toHaveBeenCalled()
  })
})
