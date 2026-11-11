import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GET, POST } from './route'

const { getCallerProfile, loadScanPlacement, claimAsPlayer, from, rpc } = vi.hoisted(() => ({
  getCallerProfile: vi.fn(),
  loadScanPlacement: vi.fn(),
  claimAsPlayer: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({ getCallerProfile }))
vi.mock('@/lib/hunts/claim-store', () => ({ loadScanPlacement, claimAsPlayer }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from }) }))
vi.mock('@/lib/hunts/staff-store', () => ({ huntRpc: () => rpc }))

const origin = 'https://frequencylocal.com'
const scanPath = '/hunts/p/trail-stop'
const landingPath = '/play/neighborhood-trail'
const placement = { id: 'placement-1', huntId: 'hunt-1', revokedAt: null, huntSlug: 'neighborhood-trail' }
const context = { params: Promise.resolve({ code: 'trail-stop' }) }
const token = 'signed.claim-token'

function scan({ from = origin, agent = 'Mozilla/5.0' } = {}) {
  return GET(new Request(`${from}${scanPath}?token=never-forward`, { headers: { 'User-Agent': agent } }), context)
}

function confirm({ from = origin, sentOrigin = from as string | null, agent = 'Mozilla/5.0', fields = new URLSearchParams({ token }) } = {}) {
  const headers = new Headers({ 'User-Agent': agent })
  if (sentOrigin !== null) headers.set('Origin', sentOrigin)
  return POST(new Request(`${from}${scanPath}`, { method: 'POST', headers, body: fields }), context)
}

beforeEach(() => {
  vi.stubEnv('HUNTS_ENABLED', '1')
  vi.stubEnv('HUNTS_CLAIMS_ENABLED', '1')
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', origin)
  vi.stubEnv('NEXT_PUBLIC_APP_URL', origin)
  vi.stubEnv('VERCEL_ENV', '')
  getCallerProfile.mockResolvedValue({ id: 'player-1' })
  loadScanPlacement.mockResolvedValue(placement)
  claimAsPlayer.mockResolvedValue({ ok: true, result: 'credited', replayed: false })
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  vi.resetAllMocks()
})

describe('Hunt placement scan', () => {
  it('sends a signed-in player to confirmation without issuing or claiming on GET', async () => {
    const response = await scan()

    expect(response.status).toBe(302)
    expect(response.headers.get('Location')).toBe(`${origin}${landingPath}?p=trail-stop`)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(loadScanPlacement).toHaveBeenCalledWith({ code: 'trail-stop' })
    expect(claimAsPlayer).not.toHaveBeenCalled()
  })

  it('sends a crawler only to the public landing and refuses a crawler POST before auth', async () => {
    const agent = 'Slackbot-LinkExpanding 1.0'
    const response = await scan({ agent })
    expect(response.status).toBe(302)
    expect(response.headers.get('Location')).toBe(`${origin}${landingPath}`)
    loadScanPlacement.mockClear()

    expect((await confirm({ agent })).status).toBe(403)
    expect(getCallerProfile).not.toHaveBeenCalled()
    expect(loadScanPlacement).not.toHaveBeenCalled()
    expect(claimAsPlayer).not.toHaveBeenCalled()
  })

  it('sends a signed-out visitor only to the public landing and refuses their POST', async () => {
    getCallerProfile.mockResolvedValue(null)
    const response = await scan()
    expect(response.status).toBe(302)
    expect(response.headers.get('Location')).toBe(`${origin}${landingPath}`)
    loadScanPlacement.mockClear()

    expect((await confirm()).status).toBe(401)
    expect(loadScanPlacement).not.toHaveBeenCalled()
    expect(claimAsPlayer).not.toHaveBeenCalled()
  })

  it('redirects a scan from a non-app host to the configured host and discards query parameters', async () => {
    const response = await scan({ from: 'https://foreign.example' })

    expect(response.status).toBe(302)
    expect(response.headers.get('Location')).toBe(`${origin}${scanPath}`)
    expect(getCallerProfile).not.toHaveBeenCalled()
    expect(claimAsPlayer).not.toHaveBeenCalled()
  })

  it.each([
    { sentOrigin: 'https://foreign.example' },
    { sentOrigin: 'http://frequencylocal.com' },
    { sentOrigin: null },
    { from: 'https://foreign.example' },
    { from: 'https://foreign.vercel.app' },
  ])('refuses a confirmation from an invalid origin %o before auth or lookup', async (request) => {
    expect((await confirm(request)).status).toBe(403)
    expect(getCallerProfile).not.toHaveBeenCalled()
    expect(loadScanPlacement).not.toHaveBeenCalled()
    expect(claimAsPlayer).not.toHaveBeenCalled()
  })

  it.each([placement, null])('refuses revoked and unknown placements on GET and POST', async (existing) => {
    loadScanPlacement.mockResolvedValue(existing && { ...existing, revokedAt: '2026-11-11T00:00:00Z' })

    expect((await scan()).status).toBe(404)
    expect(getCallerProfile).not.toHaveBeenCalled()
    expect((await confirm()).status).toBe(404)
    expect(claimAsPlayer).not.toHaveBeenCalled()
  })

  it.each(['HUNTS_ENABLED', 'HUNTS_CLAIMS_ENABLED'])('stays dark with %s off', async (flag) => {
    vi.stubEnv(flag, '')

    expect((await scan()).status).toBe(404)
    expect((await confirm()).status).toBe(404)
    expect(getCallerProfile).not.toHaveBeenCalled()
    expect(loadScanPlacement).not.toHaveBeenCalled()
    expect(claimAsPlayer).not.toHaveBeenCalled()
  })

  it.each(['', 'token=one&token=two', 'token=one&missionKey=other', 'token=one&placementId=other'])('rejects an invalid form (%s) before lookup', async (body) => {
    expect((await confirm({ fields: new URLSearchParams(body) })).status).toBe(400)
    expect(loadScanPlacement).not.toHaveBeenCalled()
    expect(claimAsPlayer).not.toHaveBeenCalled()
  })

  it('submits only the resolved placement, signed-in actor and stable token digest', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_123)

    const first = await confirm()
    const replay = await confirm()

    expect(loadScanPlacement).toHaveBeenCalledWith({ code: 'trail-stop' })
    expect(claimAsPlayer.mock.calls).toEqual(Array.from({ length: 2 }, () => ['player-1', {
      placementId: 'placement-1', token,
      idempotencyKey: createHash('sha256').update(token).digest('hex'),
      nowEpoch: 1_700_000_000,
    }]))
    for (const response of [first, replay]) {
      expect(response.status).toBe(303)
      expect(response.headers.get('Location')).toBe(`${origin}${landingPath}?claim=credited`)
      expect(response.headers.get('Referrer-Policy')).toBe('no-referrer')
    }
  })

  it('never presents a refused claim as a credit', async () => {
    claimAsPlayer.mockResolvedValue({ ok: false, reason: 'bad_token' })

    const response = await confirm()

    expect(response.status).toBe(303)
    expect(response.headers.get('Location')).toBe(`${origin}${landingPath}?claim=unavailable`)
  })

  it('keeps confirmation on the exact configured preview when that deploy serves the scan', async () => {
    const host = 'frequency-web-my-preview.vercel.app'
    const from = `https://${host}`
    vi.stubEnv('VERCEL_ENV', 'preview')
    vi.stubEnv('VERCEL_URL', host)

    expect((await scan({ from })).headers.get('Location')).toBe(`${from}${landingPath}?p=trail-stop`)
    expect((await confirm({ from })).headers.get('Location')).toBe(`${from}${landingPath}?claim=credited`)
    expect((await confirm({ from: 'https://foreign.vercel.app' })).status).toBe(403)
  })
})

async function realClaimAdapter() {
  const adapter = await vi.importActual<typeof import('@/lib/hunts/claim-store')>('@/lib/hunts/claim-store')
  loadScanPlacement.mockImplementation(adapter.loadScanPlacement)
  claimAsPlayer.mockImplementation(adapter.claimAsPlayer)
  vi.stubEnv('HUNTS_PROOF_SECRET', 'test-proof-secret')
  rpc.mockResolvedValue({ data: { result: 'credited' }, error: null })

  const missions = ['first-stop', 'second-stop'].map((mission_key) => ({
    mission_key, version_id: 'version-1', title: mission_key, visible_body: null, locked_teaser: null, opens_at: null, closes_at: null,
  }))
  const rows: Record<string, Record<string, unknown>[]> = {
    hunt_placements: [{ id: placement.id, hunt_id: placement.huntId, slug: 'trail-stop', medium: 'qr', revoked_at: null }],
    hunts: [{ id: placement.huntId, slug: placement.huntSlug, status: 'live', visibility: 'public', current_version_id: 'version-1' }],
    hunt_runs: ['player-1', 'player-2'].map((player, index) => ({
      id: `run-${index + 1}`, hunt_id: placement.huntId, version_id: 'version-1', subject_profile_id: player, state: 'active',
    })),
    hunt_mission_placements: [{ hunt_id: placement.huntId, version_id: 'version-1', placement_id: placement.id, mission_key: 'second-stop' }],
    hunt_versions: [{ id: 'version-1', hunt_id: placement.huntId, status: 'published' }],
    hunt_missions: missions,
    hunt_rule_groups: [
      { id: 'first-then-second', version_id: 'version-1', target_mission_key: 'second-stop', target_finish: false, logic: 'all', min_count: null },
      { id: 'finish', version_id: 'version-1', target_mission_key: null, target_finish: true, logic: 'all', min_count: null },
    ],
    hunt_rule_group_members: [
      { group_id: 'first-then-second', version_id: 'version-1', member_mission_key: 'first-stop' },
      { group_id: 'finish', version_id: 'version-1', member_mission_key: 'second-stop' },
    ],
    hunt_progress: [],
  }
  from.mockImplementation((table: string) => {
    let matches = rows[table] ?? []
    const query = {
      select: () => query,
      order: () => query,
      eq(column: string, value: unknown) {
        matches = matches.filter((row) => row[column] === value)
        return query
      },
      in(column: string, values: unknown[]) {
        matches = matches.filter((row) => values.includes(row[column]))
        return query
      },
      limit(count: number) {
        matches = matches.slice(0, count)
        return query
      },
      async maybeSingle() { return { data: matches[0] ?? null, error: matches.length > 1 ? new Error('Multiple records') : null } },
      then(resolve: (result: { data: typeof matches; count: number; error: null }) => void) {
        resolve({ data: matches, count: matches.length, error: null })
      },
    }
    return query
  })
  return { adapter, rows }
}

describe('Hunt placement confirmation with the real claim adapter', () => {
  it('refuses a valid token from another run and enforces prerequisites before invoking the claim command', async () => {
    const { adapter, rows } = await realClaimAdapter()
    const now = Math.floor(Date.now() / 1000)
    const other = await adapter.openClaim('player-2', placement.id, now)
    const own = await adapter.openClaim('player-1', placement.id, now)
    if (!other.ok || !own.ok) throw new Error('The fixture must have two valid run tokens')
    const postToken = (token: string) => confirm({ fields: new URLSearchParams({ token }) })

    const scanResponse = await scan()
    expect(scanResponse.headers.get('Location')).toBe(`${origin}${landingPath}?p=trail-stop`)
    expect(claimAsPlayer).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()

    const locked = await postToken(own.token)
    expect(locked.headers.get('Location')).toBe(`${origin}${landingPath}?claim=unavailable`)
    expect(await claimAsPlayer.mock.results.at(-1)?.value).toEqual({ ok: false, reason: 'mission_not_eligible' })
    expect(rpc).not.toHaveBeenCalled()

    rows.hunt_progress.push({ run_id: 'run-1', mission_key: 'first-stop', disposition: 'credited' })
    const crossRun = await postToken(other.token)
    expect(crossRun.headers.get('Location')).toBe(`${origin}${landingPath}?claim=unavailable`)
    expect(await claimAsPlayer.mock.results.at(-1)?.value).toEqual({ ok: false, reason: 'bad_token' })
    expect(rpc).not.toHaveBeenCalled()

    const allowed = await postToken(own.token)
    expect(allowed.headers.get('Location')).toBe(`${origin}${landingPath}?claim=credited`)
    expect(rpc).toHaveBeenCalledExactlyOnceWith('hunt_claim_apply', expect.objectContaining({
      p_actor: 'player-1', p_run_id: 'run-1', p_placement_id: placement.id, p_mission_key: 'second-stop', p_assurance: 'signed_node',
    }))
  })
})
