import { beforeEach, describe, expect, it, vi } from 'vitest'
import { circleResponse, circlesResponse, membershipResponse } from '@/lib/contract'

// /api/v1/circles (LIVE-716): my Circles, one public Circle, and join / leave as the caller.

let authOk = true
const listMyCircles = vi.fn()
const getPublicCircleById = vi.fn()
const joinCircleAsMember = vi.fn()
const leaveCircleAsMember = vi.fn()

vi.mock('@/lib/contract/caller', () => ({
  authorizeCaller: async () =>
    authOk ? { ok: true, via: 'bearer', caller: { id: 'p-1' }, profile: {} } : { ok: false, code: 'unauthorized', message: 'Sign in again.' },
  asCaller: (_auth: unknown, fn: () => unknown) => fn(),
}))
vi.mock('@/lib/rate-limit', () => ({ clientIp: () => '203.0.113.9', rateLimitOk: async () => true }))
vi.mock('@/lib/circles/store', () => ({ listMyCircles }))
vi.mock('@/lib/discover', () => ({ getPublicCircleById }))
vi.mock('@/lib/circles/join', () => ({ joinCircleAsMember, leaveCircleAsMember }))

const ID = '4b3f1c2e-8d7a-4c1b-9e2f-1a2b3c4d5e6f'
const circle = { id: ID, slug: 'sunrise', name: 'Sunrise', about: null, type: 'local', member_count: 7, status: 'active', image_url: null }
const ctx = { params: Promise.resolve({ id: ID }) }

beforeEach(() => {
  authOk = true
  listMyCircles.mockReset().mockResolvedValue([circle])
  getPublicCircleById.mockReset().mockResolvedValue({ ...circle, city: null, channel_name: null, channel_slug: null })
  joinCircleAsMember.mockReset().mockResolvedValue({ data: { joined: true } })
  leaveCircleAsMember.mockReset().mockResolvedValue({ data: undefined })
})

describe('/api/v1/circles', () => {
  it('lists the caller\'s Circles', async () => {
    const { GET } = await import('./route')
    const json = await (await GET(new Request('https://x/api/v1/circles'))).json()
    expect(circlesResponse.safeParse(json).success).toBe(true)
    expect(json.data.items[0]).toMatchObject({ slug: 'sunrise', memberCount: 7 })
    expect(listMyCircles).toHaveBeenCalledWith('p-1')
  })

  it('reads one public Circle, and not_found for a closed one', async () => {
    const { GET } = await import('./[id]/route')
    const json = await (await GET(new Request('https://x/api'), ctx)).json()
    expect(circleResponse.safeParse(json).success).toBe(true)
    getPublicCircleById.mockResolvedValue(null)
    expect((await GET(new Request('https://x/api'), { params: Promise.resolve({ id: ID }) })).status).toBe(404)
  })

  it('joins and leaves as the caller, never as invited', async () => {
    const { POST, DELETE } = await import('./[id]/membership/route')
    const joined = await (await POST(new Request('https://x/api', { method: 'POST' }), { params: Promise.resolve({ id: ID }) })).json()
    expect(membershipResponse.safeParse(joined).success).toBe(true)
    expect(joinCircleAsMember).toHaveBeenCalledWith('p-1', ID, { invited: false })
    const left = await (await DELETE(new Request('https://x/api', { method: 'DELETE' }), { params: Promise.resolve({ id: ID }) })).json()
    expect(left.data).toEqual({ member: false })
    expect(leaveCircleAsMember).toHaveBeenCalledWith('p-1', ID)
  })

  it('passes a refused join through as forbidden', async () => {
    joinCircleAsMember.mockResolvedValue({ error: 'This circle is invite only.' })
    const { POST } = await import('./[id]/membership/route')
    expect((await POST(new Request('https://x/api', { method: 'POST' }), ctx)).status).toBe(403)
  })

  it('is a 401 signed out', async () => {
    authOk = false
    const { GET } = await import('./route')
    expect((await GET(new Request('https://x/api/v1/circles'))).status).toBe(401)
  })
})
