// FH-031S: the player's Trail page reads the finale for this run and this profile only, shows the panel,
// and a finale read that fails leaves the Trail playable with no panel.
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
  loadVisitedStopPoints: vi.fn(),
  startOrResumeRun: vi.fn(),
  loadRallyFinale: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({ getMyProfileId: store.getMyProfileId }))
vi.mock('@/lib/hunts/run-store', () => store)
vi.mock('@/lib/hunts/rally-finale-store', () => ({ loadRallyFinale: store.loadRallyFinale }))
vi.mock('@/components/templates', () => ({ FocusTemplate: ({ children }: { children: ReactNode }) => <main>{children}</main> }))
vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NOT_FOUND') },
  redirect: (to: string) => { throw new Error(to) },
}))

const draft = {
  title: 'Coast Trail', hook: '', area: '', audience: '', routeTestedAtRevision: 1, permissionConfirmed: true,
  stops: [1, 2, 3].map((n) => ({ place: `Place ${n}`, clue: `Clue ${n}`, hint: '', placementReady: true })),
}
const trail = {
  huntId: 'hunt-1', versionId: 'version-1', huntState: 'published', revision: 1, title: draft.title,
  graph: draftToGraph(draft), content: publishRows(draft).missions,
}
const fullFinale = {
  kind: 'finale',
  event: { id: 'e1', title: 'Rally night', slug: 'rally-night', startsAt: null },
  capacity: { capacity: 40, going: 40, spotsLeft: 0, isFull: true },
  admission: 'none',
  attendance: 'none',
  seat: null,
  access: { allowed: false, reason: 'event_full' },
}
const render = async () => renderToStaticMarkup(await PlayPage({ params: Promise.resolve({ slug: 'coast-trail' }), searchParams: Promise.resolve({}) }))

beforeEach(() => {
  vi.stubEnv('HUNTS_ENABLED', 'on')
  store.getMyProfileId.mockResolvedValue('player-1')
  store.loadVisitedStopPoints.mockResolvedValue([])
  store.loadPublishedTrail.mockResolvedValue(trail)
  store.loadRunCredits.mockResolvedValue([])
  store.startOrResumeRun.mockResolvedValue({ runId: 'run-1', state: 'completed' })
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetAllMocks()
})

describe('Trail page finale', () => {
  it('shows a finished player with no seat at a full Event the full message and the Event link', async () => {
    store.loadRallyFinale.mockResolvedValue(fullFinale)
    const html = await render()
    expect(store.loadRallyFinale).toHaveBeenCalledWith('run-1', 'player-1', expect.any(String))
    expect(html).toContain('The finale is full.')
    expect(html).toContain('href="/events/rally-night"')
  })

  it('keeps the Trail when the finale read fails', async () => {
    store.loadRallyFinale.mockRejectedValue(new Error('down'))
    const html = await render()
    expect(html).toContain('Clue 1')
    expect(html).not.toContain('The finale')
  })
})
