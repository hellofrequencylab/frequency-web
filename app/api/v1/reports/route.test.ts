import { beforeEach, describe, expect, it, vi } from 'vitest'
import { blockResponse, reportResponse } from '@/lib/contract'

// /api/v1/reports and /api/v1/blocks (LIVE-723).

let authOk = true
let reportResult: { data?: undefined; error?: string } = { data: undefined }
const report = vi.fn(async () => reportResult)
const block = vi.fn(async () => ({ ok: true }))
const unblock = vi.fn(async () => ({ ok: true }))

vi.mock('@/lib/contract/caller', () => ({
  authorizeCaller: async () =>
    authOk ? { ok: true, via: 'bearer', caller: { id: 'p-1' }, profile: {} } : { ok: false, code: 'unauthorized', message: 'Sign in again.' },
  asCaller: (_a: unknown, fn: () => Promise<unknown>) => fn(),
}))
vi.mock('@/app/(main)/feed/report-actions', () => ({ reportContent: report }))
vi.mock('@/lib/blocking', () => ({ blockUser: block, unblockUser: unblock }))
vi.mock('@/lib/rate-limit', () => ({ clientIp: () => '203.0.113.9', rateLimitOk: async () => true }))

const ID = '4b3f1c2e-8d7a-4c1b-9e2f-1a2b3c4d5e6f'
const req = (method: string, body: unknown) => new Request('https://frequencylocal.com/api/v1/x', { method, body: JSON.stringify(body) })

beforeEach(() => {
  authOk = true
  reportResult = { data: undefined }
  report.mockClear()
  block.mockClear()
  unblock.mockClear()
})

describe('POST /api/v1/reports', () => {
  it("files the report through the web's reportContent", async () => {
    const { POST } = await import('./route')
    const res = await POST(req('POST', { targetType: 'post', targetId: ID, reason: 'harassment', details: 'x' }))
    const json = await res.json()
    expect(reportResponse.safeParse(json).success).toBe(true)
    expect(res.status).toBe(200)
    expect(report).toHaveBeenCalledWith('post', ID, 'harassment', 'x')
  })

  it('maps a duplicate to conflict and refuses a bad reason', async () => {
    const { POST } = await import('./route')
    reportResult = { error: 'You have already reported this content' }
    expect((await POST(req('POST', { targetType: 'post', targetId: ID, reason: 'spam' }))).status).toBe(409)
    expect((await POST(req('POST', { targetType: 'post', targetId: ID, reason: 'meh' }))).status).toBe(400)
  })

  it('is a 401 signed out', async () => {
    authOk = false
    const { POST } = await import('./route')
    expect((await POST(req('POST', { targetType: 'post', targetId: ID, reason: 'spam' }))).status).toBe(401)
    expect(report).not.toHaveBeenCalled()
  })
})

describe('/api/v1/blocks', () => {
  it('blocks and unblocks as the caller', async () => {
    const { POST, DELETE } = await import('../blocks/route')
    const json = await (await POST(req('POST', { profileId: ID }))).json()
    expect(blockResponse.safeParse(json).success).toBe(true)
    expect(block).toHaveBeenCalledWith('p-1', ID)
    await DELETE(req('DELETE', { profileId: ID }))
    expect(unblock).toHaveBeenCalledWith('p-1', ID)
  })

  it('refuses blocking yourself', async () => {
    const { POST } = await import('../blocks/route')
    expect((await POST(req('POST', { profileId: 'p-1' }))).status).toBe(400)
  })
})
