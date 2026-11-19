import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))
const io = vi.hoisted(() => ({ answer: 'reserved' as string, calls: [] as unknown[], released: [] as string[] }))
vi.mock('@/lib/lifecycle/cap-io', () => ({
  reserveLifecycleSend: async (_db: unknown, input: unknown) => {
    io.calls.push(input)
    return io.answer
  },
  releaseLifecycleSend: async (_db: unknown, key: string) => {
    io.released.push(key)
  },
}))

import { campaignCapKey, releaseCampaignSends, reserveCampaignSend } from './campaign-cap'

beforeEach(() => {
  io.answer = 'reserved'
  io.calls.length = 0
  io.released.length = 0
})

describe('reserveCampaignSend (EMAIL-084)', () => {
  it('reserves the campaign kind with one key per campaign and address', async () => {
    expect(await reserveCampaignSend({} as never, { campaignId: 'c1', email: ' A@B.com ', profileId: 'p1' })).toBe(true)
    expect(io.calls).toEqual([{ recipient: ' A@B.com ', profileId: 'p1', kind: 'campaign', dedupeKey: 'campaign:c1:a@b.com' }])
  })

  it.each(['capped', 'error', 'duplicate'])('skips the person when the cap answers %s', async (answer) => {
    io.answer = answer
    expect(await reserveCampaignSend({} as never, { campaignId: 'c1', email: 'a@b.com' })).toBe(false)
  })

  it('gives back every slot of a send that never queued', async () => {
    await releaseCampaignSends({} as never, 'c1', ['a@b.com', 'C@D.com'])
    expect(io.released).toEqual([campaignCapKey('c1', 'a@b.com'), 'campaign:c1:c@d.com'])
  })
})
