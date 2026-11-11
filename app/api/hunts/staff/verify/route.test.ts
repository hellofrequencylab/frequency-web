import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from './route'
import { issueChallenge } from '@/lib/hunts/staff-proof'

const { caller, from, rpc, getSpaceById, getSpaceCapabilities } = vi.hoisted(() => ({
  caller: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
  getSpaceById: vi.fn(),
  getSpaceCapabilities: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({ getCallerProfile: caller }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from, rpc }) }))
vi.mock('@/lib/spaces/store', () => ({ getSpaceById }))
vi.mock('@/lib/spaces/entitlements', () => ({ getSpaceCapabilities }))
vi.mock('@/lib/signing-secret', () => ({ signingSecret: () => 'test-secret' }))

const origin = 'https://frequencylocal.com'
const scope = { huntId: 'hunt-1', placementId: 'placement-1', venueSpaceId: 'space-1', runId: 'run-1' }
const binding = {
  hunt_id: scope.huntId,
  placement_id: scope.placementId,
  venue_space_id: scope.venueSpaceId,
  version_id: 'version-2',
  mission_key: 'mission-1',
}
const run = { id: scope.runId, hunt_id: scope.huntId, version_id: binding.version_id, state: 'active', subject_profile_id: 'player-1' }

type Row = Record<string, unknown>
let tables: Record<string, Row[]>

function post(body: unknown, source: string | null = origin) {
  return POST(new Request(origin + '/api/hunts/staff/verify', {
    method: 'POST',
    headers: source ? { origin: source } : {},
    body: JSON.stringify(body),
  }))
}

function code(offset = 0) {
  return issueChallenge({ secret: 'test-secret', scope, now: Math.floor(Date.now() / 1000) + offset })
}

beforeEach(() => {
  vi.stubEnv('HUNTS_ENABLED', '1')
  vi.stubEnv('HUNTS_CLAIMS_ENABLED', '1')
  caller.mockResolvedValue({ id: 'staff-1' })
  getSpaceById.mockResolvedValue({ id: scope.venueSpaceId })
  getSpaceCapabilities.mockResolvedValue({ canEditProfile: true })
  rpc.mockImplementation(async (method: string) => ({
    data: method === 'hunt_staff_nonce_consume' ? true : { result: 'credited' },
    error: null,
  }))
  tables = {
    hunts: [{ id: scope.huntId, status: 'live', visibility: 'public', current_version_id: binding.version_id }],
    hunt_roles: [],
    hunt_partners: [{
      hunt_id: scope.huntId, space_id: scope.venueSpaceId, status: 'accepted',
      effective_at: '2020-01-01T00:00:00Z', revoked_at: null, permitted_roles: ['operator'],
    }],
    hunt_placements: [{ id: scope.placementId, hunt_id: scope.huntId, revoked_at: null }],
    hunt_mission_placements: [binding],
    hunt_runs: [run],
  }
  from.mockImplementation((table: string) => {
    let rows = tables[table]
    const query = {
      select: () => query,
      eq(column: string, value: unknown) {
        rows = rows.filter((row) => row[column] === value)
        return query
      },
      limit(n: number) {
        rows = rows.slice(0, n)
        return query
      },
      async maybeSingle() { return { data: rows[0] ?? null, error: null } },
      then(resolve: (result: { data: Row[]; error: null }) => void) { resolve({ data: rows, error: null }) },
    }
    return query
  })
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetAllMocks()
})

describe('Hunt staff door', () => {
  it('credits the uniquely bound mission when a staff member submits only the signed code', async () => {
    tables.hunt_mission_placements.push({ ...binding, version_id: 'old-version', mission_key: 'old-mission' })
    const response = await post({ token: code() })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true, replayed: false })
    expect(rpc).toHaveBeenNthCalledWith(1, 'hunt_staff_nonce_consume', expect.objectContaining({ p_staff: 'staff-1' }))
    expect(rpc).toHaveBeenNthCalledWith(2, 'hunt_claim_apply', expect.objectContaining({
      p_actor: 'player-1', p_mission_key: binding.mission_key, p_assurance: 'staff',
    }))
  })

  it('still accepts matching explicit scope and mission fields', async () => {
    const response = await post({ token: code(), ...scope, missionKey: binding.mission_key })
    expect(response.status).toBe(200)
    expect(rpc).toHaveBeenCalledTimes(2)
  })

  it.each([
    ['ambiguous mission', [binding, { ...binding, mission_key: 'mission-2' }], [run]],
    ['wrong binding version', [{ ...binding, version_id: 'old-version' }], [run]],
    ['wrong venue', [{ ...binding, venue_space_id: 'other-space' }], [run]],
    ['stale run version', [binding], [{ ...run, version_id: 'old-version' }]],
  ] as const)('refuses a %s without spending a nonce', async (_reason, bindings, runs) => {
    tables.hunt_mission_placements = [...bindings]
    tables.hunt_runs = [...runs]

    const response = await post({ token: code() })

    expect(response.status).toBe(404)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('refuses tampered request fields and forged signatures without spending a nonce', async () => {
    const token = code()
    expect((await post({ token, missionKey: 'other-mission' })).status).toBe(404)
    from.mockClear()

    expect((await post({ token, runId: 'other-run' })).status).toBe(404)
    expect((await post({ token: token.slice(0, -2) })).status).toBe(404)
    expect(from).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('refuses expired proof, revoked placement and cross-Space staff without spending a nonce', async () => {
    expect((await post({ token: code(-121) })).status).toBe(409)
    tables.hunt_placements[0].revoked_at = '2020-01-01T00:00:00Z'
    expect((await post({ token: code() })).status).toBe(409)
    getSpaceCapabilities.mockResolvedValue({ canEditProfile: false })
    expect((await post({ token: code() })).status).toBe(404)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('refuses wrong or missing origins and gates signed-out and disabled requests', async () => {
    const token = code()
    expect((await post({ token }, 'https://other.example')).status).toBe(403)
    expect((await post({ token }, 'http://frequencylocal.com')).status).toBe(403)
    expect((await post({ token }, null)).status).toBe(403)
    expect(caller).not.toHaveBeenCalled()

    caller.mockResolvedValue(null)
    expect((await post({ token })).status).toBe(401)
    vi.stubEnv('HUNTS_CLAIMS_ENABLED', '')
    expect((await post({ token })).status).toBe(404)
    expect(from).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })

  it.each([[null], [[]], ['invalid']])('returns 400 for non-object JSON %j', async (body) => {
    expect((await post(body)).status).toBe(400)
    expect(from).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })
})
