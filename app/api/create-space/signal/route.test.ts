import { beforeEach, describe, expect, it, vi } from 'vitest'

// SEC-042: the builder's first-party count always lands; Google gets a copy only when this browser
// allows analytics.
const track = vi.fn(async () => true)
const allowed = vi.fn(async () => false)
vi.mock('@/lib/analytics/track', () => ({ track: (...a: unknown[]) => track(...(a as [])) }))
vi.mock('@/lib/analytics/server-google-policy', () => ({ requestGoogleAllowed: () => allowed() }))
vi.mock('@/lib/rate-limit', () => ({ rateLimitOk: async () => true }))

import { POST } from './route'

const body = JSON.stringify({ v: 'abcdefghijklmnop', event: 'createspace.accent_picked', props: { accent: 3 } })
const req = () => new Request('https://frequencylocal.com/api/create-space/signal', { method: 'POST', body }) as never

describe('create-space signal sink', () => {
  beforeEach(() => { track.mockClear(); allowed.mockReset() })

  it('records the step but does not mirror it to Google when the browser declined', async () => {
    allowed.mockResolvedValue(false)
    expect((await POST(req())).status).toBe(204)
    expect(track).toHaveBeenCalledTimes(1)
    expect(track.mock.calls[0]).toEqual(expect.arrayContaining([expect.objectContaining({ mirrorGa: false })]))
  })

  it('mirrors it when the browser allows analytics', async () => {
    allowed.mockResolvedValue(true)
    await POST(req())
    expect(track.mock.calls[0]).toEqual(expect.arrayContaining([expect.objectContaining({ mirrorGa: true })]))
  })
})
