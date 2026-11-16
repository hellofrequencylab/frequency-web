import { describe, it, expect, vi, beforeEach } from 'vitest'

// SCAN-1226: the sitemap's circles read used to stop at the 200 rows `public_circles` clamps to.
// `getAllPublicCircles` walks past it through `public_circles_page` (migration 20270346066000).
// What is pinned here is the wiring: page one is the unchanged read, the page RPC is asked only
// when page one is full, the offsets are right, a row seen twice is named once, and a database
// that does not have the page RPC yet still answers with page one.

type Reply = { data: unknown; error: { code?: string; message: string } | null; status?: number }
const rpc = vi.fn(async (_fn: string, _args: Record<string, unknown>): Promise<Reply> => ({ data: [], error: null }))
vi.mock('@/lib/supabase/public', () => ({ createPublicClient: () => ({ rpc }) }))

import { getAllPublicCircles, PUBLIC_CIRCLES_WALK_CAP } from './discover'

const rows = (from: number, count: number) => Array.from({ length: count }, (_, i) => ({ id: `c${from + i}`, slug: `s${from + i}` }))

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('getAllPublicCircles', () => {
  it('makes the one unchanged read when page one is not full', async () => {
    rpc.mockResolvedValueOnce({ data: rows(0, 35), error: null })
    expect(await getAllPublicCircles({ failClosed: true })).toHaveLength(35)
    expect(rpc.mock.calls).toEqual([['public_circles', { _limit: 200 }]])
  })

  it('walks the page RPC from offset 200 until a short page', async () => {
    rpc
      .mockResolvedValueOnce({ data: rows(0, 200), error: null })
      .mockResolvedValueOnce({ data: rows(200, 200), error: null })
      .mockResolvedValueOnce({ data: rows(400, 7), error: null })
    const all = await getAllPublicCircles({ failClosed: true })
    expect(all).toHaveLength(407)
    expect(new Set(all.map((c) => c.id)).size).toBe(407)
    expect(rpc.mock.calls).toEqual([
      ['public_circles', { _limit: 200 }],
      ['public_circles_page', { _limit: 200, _offset: 200 }],
      ['public_circles_page', { _limit: 200, _offset: 400 }],
    ])
  })

  it('names a circle once when it turns up on two pages', async () => {
    rpc
      .mockResolvedValueOnce({ data: rows(0, 200), error: null })
      .mockResolvedValueOnce({ data: [...rows(199, 1), ...rows(200, 3)], error: null })
    const all = await getAllPublicCircles()
    expect(all.map((c) => c.id).filter((id) => id === 'c199')).toHaveLength(1)
    expect(all).toHaveLength(203)
  })

  it('keeps page one, and says so in the log, when the page RPC is not there yet', async () => {
    rpc
      .mockResolvedValueOnce({ data: rows(0, 200), error: null })
      .mockResolvedValueOnce({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.public_circles_page' }, status: 404 })
    expect(await getAllPublicCircles({ failClosed: true })).toHaveLength(200)
    expect(rpc).toHaveBeenCalledTimes(2)
    expect(console.error).toHaveBeenCalled()
  })

  it('stops at its stated ceiling rather than walking for ever', async () => {
    let page = 0
    rpc.mockImplementation(async () => ({ data: rows(200 * page++, 200), error: null }))
    const all = await getAllPublicCircles()
    expect(all).toHaveLength(PUBLIC_CIRCLES_WALK_CAP)
    expect(rpc).toHaveBeenCalledTimes(PUBLIC_CIRCLES_WALK_CAP / 200)
  })
})
