// The ONE browser-side reader of /api/search-handles (scan2 L5-17, 2026-09-05).
//
// Every @mention popup, person picker and invite box used to call the route by hand, and most of
// them did it the same unsafe way: `await res.json()` inside a setTimeout with no `res.ok` check
// and no try/catch. A 500 page or an auth redirect is not JSON, so `res.json()` threw inside the
// timer callback, which is an unhandled rejection in the browser, and the popup was left holding
// whatever it showed last. Two of the sites also had no cancel flag, so a slow older response
// could land AFTER a newer one and overwrite it with results for a query the member had already
// typed past.
//
// This module is pure and framework-free so it can be unit tested with a fake fetch. It does four
// things every site needs and none of them should reimplement:
//   1. checks `res.ok` and treats anything else as "no results";
//   2. parses inside try/catch and treats a non-JSON body as "no results";
//   3. aborts the previous in-flight request and drops any response that is older than the latest
//      request (a request counter, so a late arrival is ignored even when abort is a no-op);
//   4. never throws: the caller gets an array to show, or `null` to ignore.
//
// Return contract: `T[]` is the answer to the LATEST query (possibly empty), and `null` means
// "this response is stale, do nothing". A caller renders on an array and ignores null.

/** The shape /api/search-handles returns per hit. Sites that need `friend_status` narrow `T`. */
export interface HandleHit {
  id: string
  handle: string
  display_name: string
  avatar_url: string | null
}

type FetchLike = (input: string, init?: { signal?: AbortSignal }) => Promise<{
  ok: boolean
  json: () => Promise<unknown>
}>

/** Build one searcher. Each component instance should own its own (a `useMemo(() => createHandleSearch(), [])`),
 *  so two pickers on one page never cancel each other's requests. */
export function createHandleSearch<T extends HandleHit = HandleHit>(fetchImpl?: FetchLike) {
  let latest = 0
  let inFlight: AbortController | null = null

  return async function searchHandles(q: string): Promise<T[] | null> {
    const term = q.trim()
    const seq = ++latest
    inFlight?.abort()
    inFlight = null
    if (!term) return []

    const ctrl = typeof AbortController === 'function' ? new AbortController() : null
    inFlight = ctrl
    const doFetch: FetchLike = fetchImpl ?? ((input, init) => fetch(input, init))
    try {
      const res = await doFetch(`/api/search-handles?q=${encodeURIComponent(term)}`, ctrl ? { signal: ctrl.signal } : undefined)
      if (seq !== latest) return null
      if (!res.ok) return []
      const json = (await res.json()) as { profiles?: unknown } | null
      if (seq !== latest) return null
      const profiles = json && typeof json === 'object' ? json.profiles : undefined
      return Array.isArray(profiles) ? (profiles as T[]) : []
    } catch {
      // Aborted, offline, rate limited, or a non-JSON body: the latest query shows nothing, an
      // older one is simply ignored.
      return seq !== latest ? null : []
    } finally {
      if (inFlight === ctrl) inFlight = null
    }
  }
}
