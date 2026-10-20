import { beforeEach, describe, expect, it, vi } from 'vitest'

// LIVE-1155: the device asks for its Realtime token on the device wire (flat { ok, reason? } JSON).

const ID = '4b3f1c2e-8d7a-4c1b-9e2f-1a2b3c4d5e6f'
const SECRET = 'A'.repeat(43)

let scannersOn = true
let relayOn = true
let allowed = true
let device: { id: string; spaceId: string; label: string } | null = { id: ID, spaceId: 's-1', label: 'CU5K' }
const authenticate = vi.fn(async (h: string | null) => (h ? device : null))
const mint = vi.fn(async (_d: unknown): Promise<Record<string, unknown>> => ({
  ok: true,
  token: 'h.p.s',
  expires_at: 1_760_000_900,
  channel: `device:${ID}`,
  realtime_url: 'wss://abc.supabase.co/realtime/v1/websocket',
  apikey: 'anon',
  allowed_cmds: ['system.status'],
}))

vi.mock('@/lib/devices/store', () => ({
  scannerDevicesEnabled: () => scannersOn,
  authenticateDevice: authenticate,
  touchDevice: async () => {},
}))
vi.mock('@/lib/devices/relay-store', () => ({ deviceRelayEnabled: () => relayOn, mintRelayToken: mint }))
vi.mock('@/lib/rate-limit', () => ({ clientIp: () => '203.0.113.9', rateLimitOk: async () => allowed }))

function post(header: string | null = `${ID}.${SECRET}`) {
  const headers: Record<string, string> = {}
  if (header) headers['X-Frequency-Device'] = header
  return new Request('https://frequencylocal.com/api/v1/devices/realtime-token', { method: 'POST', headers })
}

beforeEach(() => {
  scannersOn = true
  relayOn = true
  allowed = true
  device = { id: ID, spaceId: 's-1', label: 'CU5K' }
  authenticate.mockClear()
  mint.mockClear()
})

describe('POST /api/v1/devices/realtime-token', () => {
  it('mints for the authenticated device and answers flat JSON, never cached', async () => {
    const { POST } = await import('./route')
    const res = await POST(post())
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toContain('no-store')
    const body = await res.json()
    expect(body).toMatchObject({ ok: true, token: 'h.p.s', channel: `device:${ID}`, allowed_cmds: ['system.status'] })
    expect(mint).toHaveBeenCalledWith(device)
  })

  it('is a 404 while either switch is off, before any credential read', async () => {
    const { POST } = await import('./route')
    relayOn = false
    expect((await POST(post())).status).toBe(404)
    relayOn = true
    scannersOn = false
    const res = await POST(post())
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ ok: false, reason: 'not_enabled' })
    expect(authenticate).not.toHaveBeenCalled()
    expect(mint).not.toHaveBeenCalled()
  })

  it('is a 401 for a missing or revoked device', async () => {
    const { POST } = await import('./route')
    expect((await POST(post(null))).status).toBe(401)
    device = null
    expect(await (await POST(post())).json()).toEqual({ ok: false, reason: 'device_unauthorized' })
    expect(mint).not.toHaveBeenCalled()
  })

  it('answers a switched-off relay as ok:false, a missing secret as 503, and a flood as 429', async () => {
    const { POST } = await import('./route')
    mint.mockResolvedValueOnce({ ok: false, reason: 'relay_disabled' })
    const off = await POST(post())
    expect(off.status).toBe(200)
    expect(await off.json()).toEqual({ ok: false, reason: 'relay_disabled' })
    mint.mockResolvedValueOnce({ ok: false, reason: 'not_configured' })
    expect((await POST(post())).status).toBe(503)
    allowed = false
    const limited = await POST(post())
    expect(limited.status).toBe(429)
    expect(limited.headers.get('retry-after')).toBe('30')
  })
})
