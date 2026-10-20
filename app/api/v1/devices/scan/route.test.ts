import { beforeEach, describe, expect, it, vi } from 'vitest'

// LIVE-1125: the device wire. A scanner authenticates with X-Frequency-Device (never a bearer), gets a
// flat { ok, reason?, … } body, and 404 while the switch is off (the firmware reads that as "backend not
// set up").

const ID = '4b3f1c2e-8d7a-4c1b-9e2f-1a2b3c4d5e6f'
const SECRET = 'A'.repeat(43)
const TOKEN = 'abcdefghijklmnopqrstuv'

let enabled = true
let allowed = true
let device: { id: string; spaceId: string; label: string } | null = { id: ID, spaceId: 's-1', label: 'Front counter' }
const authenticate = vi.fn(async (_h: string | null) => device)
const authenticateSigned = vi.fn(async (_id: string | null, _sig: string | null, _body: string) => device)
let fresh = true
const claimOnce = vi.fn(async () => fresh)
const touchDevice = vi.fn(async () => {})
const scan = vi.fn(async () => ({
  ok: true,
  member: { display_name: 'Maya' },
  zapsAwarded: 25,
  loyalty: { stamps: 2, required: 6, earned: false },
}))
const issue = vi.fn(async () => ({ ok: true, token: TOKEN, displayName: 'Maya' }))

vi.mock('@/lib/devices/store', () => ({
  scannerDevicesEnabled: () => enabled,
  authenticateDevice: authenticate,
  authenticateSignedDevice: authenticateSigned,
  touchDevice,
  issueCardForHandle: issue,
}))
vi.mock('@/lib/devices/scan', () => ({ scanCard: scan }))
vi.mock('@/lib/rate-limit', () => ({ clientIp: () => '203.0.113.9', rateLimitOk: async () => allowed, claimOnce }))
vi.mock('@/lib/site', () => ({ SITE_URL: 'https://frequencylocal.com' }))

function post(path: string, body: unknown, header: string | null = `${ID}.${SECRET}`) {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (header) headers['X-Frequency-Device'] = header
  return new Request(`https://frequencylocal.com${path}`, { method: 'POST', headers, body: JSON.stringify(body) })
}

beforeEach(() => {
  enabled = true
  allowed = true
  device = { id: ID, spaceId: 's-1', label: 'Front counter' }
  fresh = true
  authenticate.mockClear()
  authenticateSigned.mockClear()
  claimOnce.mockClear()
  touchDevice.mockClear()
  scan.mockClear()
  issue.mockClear()
})

describe('POST /api/v1/devices/scan', () => {
  it('scans the card for the authenticated device and answers flat JSON', async () => {
    const { POST } = await import('./route')
    const res = await POST(post('/api/v1/devices/scan', { card_token: TOKEN, uid: '04:a2:1f:9c', queued: true, scanned_at: 1760000000 }))
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toContain('no-store')
    expect(await res.json()).toEqual({ ok: true, member: { display_name: 'Maya' }, zapsAwarded: 25, loyalty: { stamps: 2, required: 6, earned: false } })
    expect(authenticate).toHaveBeenCalledWith(`${ID}.${SECRET}`)
    expect(scan).toHaveBeenCalledWith(device, { cardToken: TOKEN, uid: '04A21F9C' })
    expect(touchDevice).toHaveBeenCalledWith(ID)
  })

  it('is a 404 while the switch is off, before any credential read', async () => {
    enabled = false
    const { POST } = await import('./route')
    const res = await POST(post('/api/v1/devices/scan', { card_token: TOKEN }))
    expect(res.status).toBe(404)
    expect(authenticate).not.toHaveBeenCalled()
  })

  it('is a 401 for a missing, wrong or revoked device', async () => {
    const { POST } = await import('./route')
    device = null
    const res = await POST(post('/api/v1/devices/scan', { card_token: TOKEN }))
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ ok: false, reason: 'device_unauthorized' })
    expect((await POST(post('/api/v1/devices/scan', { card_token: TOKEN }, null))).status).toBe(401)
    expect(scan).not.toHaveBeenCalled()
  })

  it('is a 400 for a bad token or UID, and a 429 past the limit', async () => {
    const { POST } = await import('./route')
    expect((await POST(post('/api/v1/devices/scan', {}))).status).toBe(400)
    expect((await POST(post('/api/v1/devices/scan', { card_token: TOKEN, uid: 'zz' }))).status).toBe(400)
    allowed = false
    const limited = await POST(post('/api/v1/devices/scan', { card_token: TOKEN }))
    expect(limited.status).toBe(429)
    expect(limited.headers.get('retry-after')).toBe('30')
    expect(scan).not.toHaveBeenCalled()
  })
})

describe('POST /api/v1/devices/scan relayed through the cable', () => {
  const SIG = 'v1=' + 'a'.repeat(64)
  function relayed(body: Record<string, unknown>) {
    const text = JSON.stringify(body)
    const req = new Request('https://frequencylocal.com/api/v1/devices/scan', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-Frequency-Device-Id': ID, 'X-Frequency-Signature': SIG },
      body: text,
    })
    return { req, text }
  }
  const now = () => Math.floor(Date.now() / 1000)

  it('checks the signature over the exact bytes and scans', async () => {
    const { POST } = await import('./route')
    const { req, text } = relayed({ card_token: TOKEN, uid: '04A1B2C3', scanned_at: now(), nonce: '9f86d081' })
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(authenticateSigned).toHaveBeenCalledWith(ID, SIG, text)
    expect(authenticate).not.toHaveBeenCalled()
    expect(claimOnce).toHaveBeenCalledWith(`device-scan:${ID}:9f86d081`, 600)
    expect(scan).toHaveBeenCalledWith(device, { cardToken: TOKEN, uid: '04A1B2C3' })
  })

  it('refuses a bad signature, a stale clock, a missing nonce and a replay', async () => {
    const { POST } = await import('./route')
    device = null
    expect((await POST(relayed({ card_token: TOKEN, scanned_at: now(), nonce: 'abcd1234' }).req)).status).toBe(401)
    device = { id: ID, spaceId: 's-1', label: 'Front counter' }
    const stale = await POST(relayed({ card_token: TOKEN, scanned_at: now() - 3600, nonce: 'abcd1234' }).req)
    expect(stale.status).toBe(400)
    expect(await stale.json()).toEqual({ ok: false, reason: 'stale_scan' })
    expect((await POST(relayed({ card_token: TOKEN, scanned_at: now() }).req)).status).toBe(400)
    fresh = false
    const again = await POST(relayed({ card_token: TOKEN, scanned_at: now(), nonce: 'abcd1234' }).req)
    expect(again.status).toBe(409)
    expect(await again.json()).toEqual({ ok: false, reason: 'replayed' })
    expect(scan).not.toHaveBeenCalled()
  })
})

describe('POST /api/v1/devices/cards', () => {
  it('mints a card for the handle at the device Space and returns the /c/ link once', async () => {
    const { POST } = await import('../cards/route')
    const res = await POST(post('/api/v1/devices/cards', { member_handle: '@Maya' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      ok: true,
      token: TOKEN,
      url: `https://frequencylocal.com/c/${TOKEN}`,
      member: { display_name: 'Maya' },
    })
    expect(issue).toHaveBeenCalledWith(device, 'maya')
  })

  it('answers an unknown member as ok:false, a bad body as 400, and no device as 401', async () => {
    const { POST } = await import('../cards/route')
    issue.mockResolvedValueOnce({ ok: false, reason: 'unknown_member' } as never)
    expect(await (await POST(post('/api/v1/devices/cards', { member_handle: 'ghost' }))).json()).toEqual({ ok: false, reason: 'unknown_member' })
    expect((await POST(post('/api/v1/devices/cards', { member_handle: '' }))).status).toBe(400)
    device = null
    expect((await POST(post('/api/v1/devices/cards', { member_handle: 'maya' }))).status).toBe(401)
  })
})
