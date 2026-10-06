import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nearbyNodesResponse, nodeCaptureResponse } from '@/lib/contract'

// /api/v1/nodes (LIVE-721): capture runs the web's captureNode for the verified caller; nearby
// reads the shaped list.

let authOk = true
const capture = vi.fn(async () => ({ ok: true, zapsAwarded: 5, offerTitle: null }))
const nearby = vi.fn(async () => [{ id: 'n1', type: 'qr', label: 'Plaque', lat: 1, lng: 2, radiusM: 30, distanceM: 12 }])

vi.mock('@/lib/contract/caller', () => ({
  authorizeCaller: async () =>
    authOk ? { ok: true, via: 'bearer', caller: { id: 'p-1' }, profile: {} } : { ok: false, code: 'unauthorized', message: 'Sign in again.' },
}))
vi.mock('@/lib/engagement/capture', () => ({ captureNode: capture }))
vi.mock('@/lib/engagement/nearby', () => ({ listNearbyNodes: nearby, MAX_RADIUS_M: 5000 }))
vi.mock('@/lib/rate-limit', () => ({ clientIp: () => '203.0.113.9', rateLimitOk: async () => true }))

const ID = '4b3f1c2e-8d7a-4c1b-9e2f-1a2b3c4d5e6f'

beforeEach(() => {
  authOk = true
  capture.mockClear()
  nearby.mockClear()
})

describe('POST /api/v1/nodes/{id}/capture', () => {
  it('captures for the caller with the presented code and location', async () => {
    const { POST } = await import('../[id]/capture/route')
    const res = await POST(
      new Request(`https://frequencylocal.com/api/v1/nodes/${ID}/capture`, { method: 'POST', body: JSON.stringify({ secret: 'sig', location: { lat: 1, lng: 2 } }) }),
      { params: Promise.resolve({ id: ID }) },
    )
    const json = await res.json()
    expect(nodeCaptureResponse.safeParse(json).success).toBe(true)
    expect(json.data).toEqual({ ok: true, reason: null, zapsAwarded: 5, offerTitle: null })
    expect(capture).toHaveBeenCalledWith({ nodeId: ID, actorProfileId: 'p-1', location: { lat: 1, lng: 2 }, presentedSecret: 'sig' })
  })

  it('refuses a bad id and a signed-out caller', async () => {
    const { POST } = await import('../[id]/capture/route')
    const bad = await POST(new Request('https://x/api', { method: 'POST', body: '{}' }), { params: Promise.resolve({ id: 'nope' }) })
    expect(bad.status).toBe(400)
    authOk = false
    const out = await POST(new Request('https://x/api', { method: 'POST', body: '{}' }), { params: Promise.resolve({ id: ID }) })
    expect(out.status).toBe(401)
    expect(capture).not.toHaveBeenCalled()
  })
})

describe('GET /api/v1/nodes/nearby', () => {
  it('lists nearby nodes with a default radius', async () => {
    const { GET } = await import('./route')
    const json = await (await GET(new Request('https://frequencylocal.com/api/v1/nodes/nearby?lat=1&lng=2'))).json()
    expect(nearbyNodesResponse.safeParse(json).success).toBe(true)
    expect(nearby).toHaveBeenCalledWith({ lat: 1, lng: 2 }, 1500)
  })

  it('refuses a radius past the cap', async () => {
    const { GET } = await import('./route')
    expect((await GET(new Request('https://frequencylocal.com/api/v1/nodes/nearby?lat=1&lng=2&radius=99999'))).status).toBe(400)
  })
})
