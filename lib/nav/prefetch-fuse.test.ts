import { describe, it, expect, vi } from 'vitest'
import {
  PREFETCH_FUSE,
  createPrefetchFuse,
  installPrefetchFuse,
  prefetchRouteKey,
} from './prefetch-fuse'

// ── LIVE-649 (ADR-1617): no loop in the router can turn one tab into a request flood ─────────────
//
// On 2026-09-29 one owner tab asked for every visible Link's prefetch again about 40 times a minute,
// per Link, for hours. These cases drive the fuse the way Next's router drives `fetch`: the same
// plain-object headers (`rsc`, `next-router-prefetch`, the cache-busting `_rsc` param that differs on
// every request) against a fake clock. The loop case replays that rate for a minute and fails if
// more than the budget reaches the network.

const PREFETCH = { rsc: '1', 'next-router-prefetch': '1' }

function routerPrefetch(path: string, n: number): [string, RequestInit] {
  return [`https://frequencylocal.com${path}?_rsc=${n.toString(36)}`, { headers: { ...PREFETCH } }]
}

function harness(opts: { hidden?: boolean } = {}) {
  const network = vi.fn(async () => new Response('flight', { status: 200 }))
  const target = {
    fetch: network as unknown as typeof fetch,
    document: { visibilityState: opts.hidden ? 'hidden' : 'visible' },
  }
  const undo = installPrefetchFuse(target)
  return { target, network, undo }
}

describe('prefetchRouteKey', () => {
  it('reads the router prefetch header and drops the cache-busting param', () => {
    const [a, initA] = routerPrefetch('/events/breathe', 1)
    const [b, initB] = routerPrefetch('/events/breathe', 2)
    expect(prefetchRouteKey(a, initA)).toBe('/events/breathe')
    expect(prefetchRouteKey(b, initB)).toBe(prefetchRouteKey(a, initA))
  })

  it('is null for a navigation, a Server Action and a plain fetch', () => {
    expect(prefetchRouteKey('/feed?_rsc=1', { headers: { rsc: '1' } })).toBeNull()
    expect(prefetchRouteKey('/feed', { method: 'POST', headers: { 'next-action': 'abc' } })).toBeNull()
    expect(prefetchRouteKey('/api/vitals', { method: 'POST' })).toBeNull()
  })
})

describe('🔴 a prefetch loop is capped at the budget (LIVE-649)', () => {
  it('replays one minute of the 2026-09-29 tab: 25 Links re-prefetched every 1.5 s', async () => {
    const { target, network } = harness()
    const links = Array.from({ length: 25 }, (_, i) => `/member-route-${i}`)
    let n = 0
    vi.useFakeTimers()
    try {
      // 40 cycles in 60 s, every visible Link once per cycle: 1,000 prefetches asked for.
      for (let cycle = 0; cycle < 40; cycle++) {
        for (const path of links) await target.fetch(...routerPrefetch(path, n++))
        vi.advanceTimersByTime(1_500)
      }
    } finally {
      vi.useRealTimers()
    }
    const reached = network.mock.calls.length
    expect(n).toBe(1_000)
    // Without the fuse all 1,000 reach the server. With it, one tab stays at or under one a second.
    expect(reached, `${reached} prefetches reached the network in one minute`).toBeLessThanOrEqual(
      PREFETCH_FUSE.perTab,
    )
  })

  it('answers a blocked prefetch locally with a non-ok response the router rejects and retries later', async () => {
    const { target, network } = harness()
    const responses: Response[] = []
    for (let i = 0; i < PREFETCH_FUSE.perRoute + 3; i++) {
      responses.push(await target.fetch(...routerPrefetch('/feed', i)))
    }
    expect(network).toHaveBeenCalledTimes(PREFETCH_FUSE.perRoute)
    const blocked = responses.at(-1)!
    expect(blocked.ok).toBe(false)
    expect(blocked.status).toBe(429)
  })

  it('never touches a navigation or a Server Action, however many there are', async () => {
    const { target, network } = harness()
    for (let i = 0; i < 200; i++) {
      await target.fetch(`https://frequencylocal.com/feed?_rsc=${i}`, { headers: { rsc: '1' } })
      await target.fetch('https://frequencylocal.com/feed', { method: 'POST', headers: { 'next-action': 'x' } })
    }
    expect(network).toHaveBeenCalledTimes(400)
  })

  it('a hidden tab prefetches nothing', async () => {
    const { target, network } = harness({ hidden: true })
    await target.fetch(...routerPrefetch('/feed', 1))
    expect(network).not.toHaveBeenCalled()
  })

  it('the budget refills once the window passes', () => {
    let now = 0
    const fuse = createPrefetchFuse({ now: () => now, hidden: () => false })
    for (let i = 0; i < PREFETCH_FUSE.perRoute; i++) expect(fuse.admit('/feed')).toBe(true)
    expect(fuse.admit('/feed')).toBe(false)
    now += PREFETCH_FUSE.windowMs + 1
    expect(fuse.admit('/feed')).toBe(true)
  })

  it('installs once and undoes cleanly', async () => {
    const { target, network, undo } = harness()
    const wrapped = target.fetch
    installPrefetchFuse(target)
    expect(target.fetch).toBe(wrapped)
    undo()
    expect(target.fetch).toBe(network)
  })
})
