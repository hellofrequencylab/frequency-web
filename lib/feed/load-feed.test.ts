import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFeedRpc } from './load-feed'

// scan2 L5-03 (2026-09-05): a failing feed RPC must surface as an ERROR result, never as an
// empty feed. Before this reader existed the callers read `data ?? []`, so an outage rendered
// "nothing posted yet" for every member and logged nothing.

afterEach(() => {
  vi.restoreAllMocks()
})

describe('readFeedRpc', () => {
  it('returns kind error, and logs the RPC name, when the RPC resolves { error }', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = readFeedRpc('feed_for_viewer', {
      data: null,
      error: { message: 'canceling statement due to statement timeout', code: '57014' },
    })
    expect(res).toEqual({ kind: 'error' })
    expect(err).toHaveBeenCalledTimes(1)
    const [fmt, ctx] = err.mock.calls[0]
    // The format string is static; the RPC name and the DB message ride the structured argument.
    expect(fmt).toBe('[feed] rpc failed')
    expect(ctx).toMatchObject({ rpc: 'feed_for_viewer', code: '57014' })
  })

  it('returns the rows on a clean call', () => {
    const res = readFeedRpc<{ id: string }>('scoped_feed_for_viewer', {
      data: [{ id: 'p1' }],
      error: null,
    })
    expect(res).toEqual({ kind: 'ok', items: [{ id: 'p1' }] })
  })

  it('treats a null data on a clean call as a genuine empty feed, not an error', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = readFeedRpc('feed_for_viewer', { data: null, error: null })
    expect(res).toEqual({ kind: 'ok', items: [] })
    expect(err).not.toHaveBeenCalled()
  })
})
