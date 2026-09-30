// THE PREFETCH FUSE (LIVE-649, ADR-1617). A hard cap on how often one tab may ask the server for a
// Link prefetch, so no loop inside the router can turn an idle tab into a request flood.
//
// WHAT IT STOPS. On 2026-09-29 one owner tab sent every visible Link's prefetch again, and again,
// for hours: about 40 requests a minute to EACH of 25 to 40 member routes, every one a 200, no
// navigation and no page refresh in between (Vercel runtime logs, dpl_DRQ9xhdp6AjEzHmSpQEz89KGCzoP
// and dpl_CvaywacE4VK3Tbpcem96dw381hZ8). That shape is Next's `pingVisibleLinks`: when the router's
// tree changes or its prefetch cache is invalidated, every Link on screen is scheduled again
// (next/dist/client/components/links.js). Something that invalidates on a cycle therefore costs one
// request per visible Link per cycle, and the router has no ceiling of its own. Next's own source
// says as much next to the route invalidation it runs when a prefetch renders a different tree than
// it asked for ("TODO: Consider also bounding retries with a counter").
//
// HOW. Next's client router calls the global `fetch` at call time (segment-cache/fetch.js), and every
// prefetch it sends carries `next-router-prefetch`. The fuse wraps `fetch` once, before hydration
// (instrumentation-client.ts), and answers a prefetch past its budget with a local 429 instead of a
// network request. A prefetch that is not `ok` is one the router already knows how to handle: it
// rejects that cache entry with its own 10 second backoff and moves on (segment-cache/cache.js), and a
// click on that Link still navigates, it just is not instant. Navigations and Server Actions never
// carry the prefetch header, so the fuse cannot touch them.
//
// THE BUDGET. Per route: 4 prefetches in 60 s (a first prefetch is two requests, the route tree and
// its segments, so this leaves room for one honest refresh). Per tab: 60 in 60 s, which is one a
// second, the row's own ceiling. A page with more visible Links than that still loads; the ones past
// the budget simply prefetch later or on hover. A hidden tab prefetches nothing: nobody can click it.

/** The budget. Exported so the test and the ADR read the same numbers. */
export const PREFETCH_FUSE = {
  perRoute: 4,
  perTab: 60,
  windowMs: 60_000,
} as const

export interface FuseClock {
  now: () => number
  hidden: () => boolean
}

export interface PrefetchFuse {
  /** True when this prefetch may go to the network; false when the fuse answers it locally. */
  admit: (routeKey: string) => boolean
}

/** Pure sliding-window counter. No globals, so the test drives it with a fake clock. */
export function createPrefetchFuse(clock: FuseClock, budget = PREFETCH_FUSE): PrefetchFuse {
  const byRoute = new Map<string, number[]>()
  let all: number[] = []
  return {
    admit(routeKey) {
      if (clock.hidden()) return false
      const now = clock.now()
      const since = now - budget.windowMs
      all = all.filter((t) => t > since)
      const mine = (byRoute.get(routeKey) ?? []).filter((t) => t > since)
      if (mine.length >= budget.perRoute || all.length >= budget.perTab) {
        byRoute.set(routeKey, mine)
        return false
      }
      mine.push(now)
      all.push(now)
      byRoute.set(routeKey, mine)
      return true
    },
  }
}

const PREFETCH_HEADER = 'next-router-prefetch'

function headerOf(headers: HeadersInit | undefined, name: string): string | null {
  if (!headers) return null
  if (typeof Headers !== 'undefined' && headers instanceof Headers) return headers.get(name)
  if (Array.isArray(headers)) {
    const hit = headers.find(([k]) => k.toLowerCase() === name)
    return hit ? hit[1] : null
  }
  for (const [k, v] of Object.entries(headers)) if (k.toLowerCase() === name) return String(v)
  return null
}

/** The route a prefetch is for, or null when the request is not a router prefetch. The key drops
 *  the router's cache-busting `_rsc` param, which differs on every request for the same route, and
 *  counts the route-tree and segment requests for one route together. */
export function prefetchRouteKey(input: RequestInfo | URL, init?: RequestInit): string | null {
  const fromRequest = typeof Request !== 'undefined' && input instanceof Request ? input : null
  const flag = headerOf(init?.headers, PREFETCH_HEADER) ?? fromRequest?.headers.get(PREFETCH_HEADER) ?? null
  if (!flag) return null
  const raw = fromRequest ? fromRequest.url : String(input)
  let url: URL
  try {
    url = new URL(raw, 'http://local')
  } catch {
    return null
  }
  url.searchParams.delete('_rsc')
  return `${url.pathname}${url.search}`
}

/** A local answer the router treats as a failed prefetch (it retries on its own backoff). */
export function blockedPrefetchResponse(): Response {
  return new Response(null, { status: 429, statusText: 'Prefetch budget spent' })
}

type FetchLike = typeof fetch

/** Wrap `target.fetch` once. Returns an undo, for tests. A second install is a no-op. */
export function installPrefetchFuse(
  target: { fetch: FetchLike; document?: { visibilityState?: string } } = globalThis as never,
  budget = PREFETCH_FUSE,
): () => void {
  const marker = target.fetch as FetchLike & { __prefetchFuse?: true }
  if (marker.__prefetchFuse) return () => {}
  const original = target.fetch
  const fuse = createPrefetchFuse(
    {
      now: () => Date.now(),
      hidden: () => target.document?.visibilityState === 'hidden',
    },
    budget,
  )
  const wrapped = ((input: RequestInfo | URL, init?: RequestInit) => {
    const key = prefetchRouteKey(input, init)
    if (key !== null && !fuse.admit(key)) return Promise.resolve(blockedPrefetchResponse())
    return original.call(target, input, init)
  }) as FetchLike & { __prefetchFuse?: true }
  wrapped.__prefetchFuse = true
  target.fetch = wrapped
  return () => {
    if (target.fetch === wrapped) target.fetch = original
  }
}
