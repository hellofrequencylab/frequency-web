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
}))

vi.mock('@/lib/auth', () => ({ getMyProfileId: store.getMyProfileId }))
vi.mock('@/lib/hunts/run-store', () => store)
const teams = vi.hoisted(() => ({ myTeamPanel: vi.fn() }))
vi.mock('@/lib/hunts/team-store', () => teams)
vi.mock('@/components/templates', () => ({ FocusTemplate: ({ children }: { children: ReactNode }) => <main>{children}</main> }))
// The map is a client leaf: what the server passes it is what reaches the browser, so capture it whole.
const mapProps = vi.hoisted(() => ({ sent: [] as string[] }))
vi.mock('@/components/hunts/visited-stops-map', () => ({
  VisitedStopsMap: (props: unknown) => {
    mapProps.sent.push(JSON.stringify(props))
    return <div data-map={JSON.stringify(props)} />
  },
}))
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
  store.loadVisitedStopPoints.mockResolvedValue([])
  mapProps.sent.length = 0
  store.startOrResumeRun.mockResolvedValue(run)
  store.loadPlayerRun.mockResolvedValue(run)
  teams.myTeamPanel.mockResolvedValue(null)
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

  it('renders the claim form and visited list with no hidden clue, place or hint in the markup', async () => {
    const html = await render()
    expect(html).toContain('Confirm stop')
    expect(html).not.toContain('Stops you visited')
    expect(html).not.toMatch(/Private hint|Clue [23]|Place [123]/)
    store.loadRunCredits.mockResolvedValue([{ mission_key: 'stop-1' }])
    const after = await render()
    expect(after).toContain('Stops you visited')
    expect(after).toContain('Place 1')
    expect(after).toContain('Clue 2')
    expect(after).not.toMatch(/Private hint|Clue 3|Place [23]/)
  })

  it('sends the map only visited stops, even when the location source returns every stop (FH-016T)', async () => {
    // A hostile source: a point for all three stops. Stop 1 is visited; 2 is open; 3 is locked.
    store.loadVisitedStopPoints.mockResolvedValue([1, 2, 3].map((n) => ({ missionKey: `stop-${n}`, lat: 33 + n / 100, lng: -117 - n / 100, approximate: false })))
    store.loadRunCredits.mockResolvedValue([{ mission_key: 'stop-1' }])
    const html = await render()
    expect(store.loadVisitedStopPoints).toHaveBeenCalledWith(trail, [{ mission_key: 'stop-1' }])
    expect(mapProps.sent).toEqual([JSON.stringify({ pins: [{ id: 'stop-1', lat: 33.01, lng: -117.01, title: 'Stop 1: Place 1' }] })])
    // Neither the serialised props nor the page source carry an unvisited stop's key, place, point, clue or hint.
    for (const source of [mapProps.sent[0], html]) {
      expect(source).not.toMatch(/Place [23]|33\.0[23]|117\.0[23]|Clue 3|Private hint/)
    }
    expect(mapProps.sent[0]).not.toMatch(/stop-[23]|Clue/)
  })

  it('sends the map nothing before the first visit and asks for no locations without a run', async () => {
    await render()
    expect(mapProps.sent).toEqual([JSON.stringify({ pins: [] })])
    expect(store.loadVisitedStopPoints).toHaveBeenCalledWith(trail, [])
    store.loadVisitedStopPoints.mockClear()
    store.loadPlayerRun.mockResolvedValue(null)
    await render('stop-1')
    expect(store.loadVisitedStopPoints).not.toHaveBeenCalled()
  })

  it('offers the scanner next to the typed code only while a stop can be confirmed (FH-016T)', async () => {
    expect(await render()).toContain('href="/scan?hint=trail"')
    vi.stubEnv('HUNTS_CLAIMS_ENABLED', '')
    expect(await render()).not.toContain('/scan')
    vi.stubEnv('HUNTS_CLAIMS_ENABLED', 'on')
    store.loadPublishedTrail.mockResolvedValue({ ...trail, huntState: 'paused' })
    expect(await render()).not.toContain('/scan')
  })

  it('shows no claim form when claims are off, the Hunt is paused, or the Trail is finished', async () => {
    vi.stubEnv('HUNTS_CLAIMS_ENABLED', '')
    expect(await render()).not.toContain('Confirm stop')
    vi.stubEnv('HUNTS_CLAIMS_ENABLED', 'on')
    store.loadPublishedTrail.mockResolvedValue({ ...trail, huntState: 'paused' })
    expect(await render()).not.toContain('Confirm stop')
    store.loadPublishedTrail.mockResolvedValue(trail)
    store.loadRunCredits.mockResolvedValue([{ mission_key: 'stop-1' }, { mission_key: 'stop-2' }, { mission_key: 'stop-3' }])
    expect(await render()).not.toContain('Confirm stop')
  })

  it('redirects a signed-out request before looking up a run', async () => {
    store.getMyProfileId.mockResolvedValue(null)
    await expect(render('stop-1')).rejects.toThrow('/sign-in?next=/hunts/coast-trail/play')
    expect(store.loadPlayerRun).not.toHaveBeenCalled()
    expect(store.startOrResumeRun).not.toHaveBeenCalled()
  })
})

describe('Trail player team panel (FH-043S)', () => {
  const TEAM = '00000000-0000-4000-a043-0000000000aa'
  const team = { teamId: TEAM, huntId: 'hunt-1', versionId: 'version-1', name: 'The Lanterns', state: 'locked', runId: 'team-run', captain: false, size: 3, stopsDone: 2 }
  const renderWith = async (search: Record<string, string>) => renderToStaticMarkup(await PlayPage({
    params: Promise.resolve({ slug: 'coast-trail' }), searchParams: Promise.resolve(search),
  }))

  it('offers to start a team, and a join form only from a captain\'s link', async () => {
    const html = await render()
    expect(html).toContain('Play as a team')
    expect(html).toContain('Start a team')
    expect(html).not.toContain('Join the team')
    expect(teams.myTeamPanel).toHaveBeenCalledWith('player-1', 'coast-trail')
    const join = await renderWith({ team: TEAM })
    expect(join).toContain('Join the team')
    expect(join).toContain(`value="${TEAM}"`)
    expect(await renderWith({ team: 'not-a-team' })).not.toContain('Join the team')
  })

  it('shows a locked member the team\'s count and the team confirm, never the solo form or a roster', async () => {
    teams.myTeamPanel.mockResolvedValue(team)
    const html = await render()
    expect(html).toContain('The Lanterns')
    expect(html).toContain('3 people, roster locked. Your team has 2 stops.')
    expect(html).toContain('Confirm stop for your team')
    expect(html).toContain('Leave the team')
    expect(html).not.toContain('Lock the roster')
    expect(html).not.toMatch(/>Confirm stop<|team-run|hunt-1/)
  })

  it('gives the captain of a forming team the lock button', async () => {
    teams.myTeamPanel.mockResolvedValue({ ...team, state: 'forming', runId: null, captain: true, size: 2, stopsDone: null })
    const html = await render()
    expect(html).toContain('Lock the roster')
    expect(html).not.toContain('Confirm stop for your team')
  })

  it('reads no team with claims off or the Trail paused, and survives a failed read', async () => {
    vi.stubEnv('HUNTS_CLAIMS_ENABLED', '')
    expect(await render()).not.toContain('Play as a team')
    vi.stubEnv('HUNTS_CLAIMS_ENABLED', 'on')
    store.loadPublishedTrail.mockResolvedValue({ ...trail, huntState: 'paused' })
    expect(await render()).not.toContain('Play as a team')
    expect(teams.myTeamPanel).not.toHaveBeenCalled()
    store.loadPublishedTrail.mockResolvedValue(trail)
    teams.myTeamPanel.mockRejectedValue(new Error('read failed'))
    expect(await render()).toContain('Start a team')
  })
})
