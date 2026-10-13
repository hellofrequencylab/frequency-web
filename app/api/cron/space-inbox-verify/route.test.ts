import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// EMAIL-022. The space-inbox-verify cron against its REAL auth gate and REAL heartbeat wrapper. What it
// pins: a request without the bearer is refused; with the switch off the run is inert and reads nothing;
// a pending row whose records are in the zone is checked, one whose records were never written is
// provisioned; a failed row older than 24 hours is skipped even when the list hands it over; a row that
// throws is recorded and the batch goes on; the list is asked for the budget's batch, oldest first.

const state = vi.hoisted(() => {
  process.env.CRON_SECRET = 'test-cron-secret'
  return {
    enabled: true,
    rows: [] as Record<string, unknown>[],
    listArgs: [] as Array<{ limit: number; failedSince: string }>,
    listThrows: false,
    provisioned: [] as string[],
    checked: [] as string[],
    throwFor: null as string | null,
    infos: [] as unknown[][],
  }
})

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn(), captureMessage: vi.fn(), setTag: vi.fn() }))
vi.mock('@/lib/observability/tags', () => ({ setObservabilityTags: () => {} }))
vi.mock('@/lib/comms/space-inbox-address', () => ({
  spaceInboxAddressesEnabled: () => state.enabled,
  listSpaceInboxAddressesToFinish: async (args: { limit: number; failedSince: string }) => {
    state.listArgs.push(args)
    if (state.listThrows) throw new Error('list down')
    return state.rows
  },
  provisionSpaceInboxAddress: async (spaceId: string) => {
    if (state.throwFor === spaceId) throw new Error('boom')
    state.provisioned.push(spaceId)
    return { ok: true, address: `hello@${spaceId}.test`, state: 'pending', message: 'being set up' }
  },
  checkSpaceInboxAddress: async (spaceId: string) => {
    if (state.throwFor === spaceId) throw new Error('boom')
    state.checked.push(spaceId)
    return { ok: true, address: `hello@${spaceId}.test`, state: 'verified', message: 'ready' }
  },
}))

import { GET, FAILED_RETRY_WINDOW_MS } from './route'

const NOW = Date.parse('2026-10-13T12:00:00Z')
const ago = (ms: number) => new Date(NOW - ms).toISOString()
const row = (spaceId: string, patch: Record<string, unknown> = {}) => ({
  id: `row-${spaceId}`, space_id: spaceId, domain: `${spaceId}.space.frequencylocal.com`, local_part: 'hello',
  provider_domain_id: 'prov', state: 'pending', dns_records: [], dns_written_at: null, verified_at: null,
  created_at: ago(60_000), updated_at: ago(60_000), ...patch,
})

function req(auth = 'Bearer test-cron-secret') {
  return new Request('https://x.test/api/cron/space-inbox-verify', { headers: auth ? { authorization: auth } : {} }) as never
}

beforeEach(() => {
  state.enabled = true; state.rows = []; state.listArgs = []; state.listThrows = false
  state.provisioned = []; state.checked = []; state.throwFor = null; state.infos = []
  delete process.env.CRON_HEARTBEAT_BASE_URL
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] })
  vi.spyOn(console, 'info').mockImplementation((...args: unknown[]) => { state.infos.push(args) })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

describe('space-inbox-verify cron', () => {
  it('refuses a request without the cron bearer', async () => {
    const res = await GET(req('Bearer nope'))
    expect(res.status).toBe(401)
    expect(state.listArgs).toEqual([])
  })

  it('is inert with the switch off: 200, skipped, nothing read', async () => {
    state.enabled = false
    const res = await GET(req())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, skipped: 'switch off' })
    expect(state.listArgs).toEqual([])
  })

  it('asks for the budgeted batch of unfinished rows, failures only from the last 24 hours', async () => {
    await GET(req())
    expect(state.listArgs).toEqual([{ limit: 25, failedSince: ago(FAILED_RETRY_WINDOW_MS) }])
  })

  it('checks a pending row whose records are written and provisions one whose records are not', async () => {
    state.rows = [row('written', { dns_written_at: ago(30_000) }), row('unwritten', { dns_written_at: null })]
    const res = await GET(req())
    const body = await res.json()
    expect(state.checked).toEqual(['written'])
    expect(state.provisioned).toEqual(['unwritten'])
    expect(body).toMatchObject({ ok: true, provisioned: 1, checked: 1, skipped: 0, verified: 1, errored: 0 })
    expect(body.rows).toEqual([
      expect.objectContaining({ spaceId: 'written', action: 'check', ok: true, state: 'verified' }),
      expect.objectContaining({ spaceId: 'unwritten', action: 'provision', ok: true, state: 'pending' }),
    ])
    expect(state.infos).toHaveLength(1)
    expect(state.infos[0][0]).toBe('[space-inbox-verify] run')
  })

  it('retries a fresh failure and skips a failed row older than 24 hours even when the list hands it over', async () => {
    state.rows = [
      row('fresh-fail', { state: 'failed', dns_written_at: ago(60_000), updated_at: ago(60 * 60 * 1000) }),
      row('old-fail', { state: 'failed', dns_written_at: ago(60_000), updated_at: ago(FAILED_RETRY_WINDOW_MS + 60_000) }),
    ]
    const body = await (await GET(req())).json()
    expect(state.checked).toEqual(['fresh-fail'])
    expect(state.provisioned).toEqual([])
    expect(body).toMatchObject({ checked: 1, skipped: 1 })
    expect(body.rows[1]).toMatchObject({ spaceId: 'old-fail', action: 'skip', ok: true })
  })

  it('records a row that throws and goes on with the rest of the batch', async () => {
    state.rows = [row('a'), row('b', { dns_written_at: ago(1) }), row('c')]
    state.throwFor = 'b'
    const res = await GET(req())
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(state.provisioned).toEqual(['a', 'c'])
    expect(body).toMatchObject({ errored: 1, provisioned: 2 })
    expect(body.rows[1]).toMatchObject({ spaceId: 'b', action: 'check', ok: false, note: 'boom' })
  })

  it('answers 500 when the rows cannot be listed, touching nothing', async () => {
    state.listThrows = true
    const res = await GET(req())
    expect(res.status).toBe(500)
    expect(state.provisioned).toEqual([]); expect(state.checked).toEqual([])
  })
})
