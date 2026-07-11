import 'server-only'

// Shared OpenStreetMap Nominatim plumbing (keyless geocoding).
//
// SERVER-SIDE ONLY. Nominatim's usage policy forbids browser autocomplete and
// requires a descriptive contact User-Agent it can reach us on before blocking, so
// every call goes through here on the server, never the client. Two consumers share
// this one module — the geocode-on-save provider (lib/events/geocode-provider) and
// the venue/address autocomplete cascade (lib/events/venue-search) — precisely so
// they share ONE in-process rate-limit serialiser and stay within Nominatim's ~1
// req/sec courtesy limit by construction.
//
// GRACEFUL-MISS is the contract: a transport error, timeout, abort, non-OK
// response, or unparseable body all resolve to `null`. Callers decide what a miss
// means (leave geog NULL on save; show no suggestions in autocomplete).

const NOMINATIM_SEARCH_URL = 'https://nominatim.openstreetmap.org/search'

// Nominatim's usage policy asks for an app + contact identifier. Sourced from env
// when set, with a sane project default so it's never empty.
const CONTACT =
  process.env.GEOCODER_CONTACT_EMAIL ??
  process.env.NEXT_PUBLIC_APP_URL ??
  'https://frequencylocal.com'
export const NOMINATIM_USER_AGENT = `Frequency/1.0 (${CONTACT})`

const DEFAULT_MIN_INTERVAL_MS = 1100
const REQUEST_TIMEOUT_MS = 5000

// The minimum spacing between our own Nominatim calls. Read per-call from env so a
// test can drop it to 0 (the cascade fires up to three sequential passes and we
// don't want unit tests waiting real seconds); defaults to a polite ~1.1s otherwise.
function minIntervalMs(): number {
  const v = Number(process.env.NOMINATIM_MIN_INTERVAL_MS)
  return Number.isFinite(v) && v >= 0 ? v : DEFAULT_MIN_INTERVAL_MS
}

let lastRequestAt = 0
let queue: Promise<unknown> = Promise.resolve()

/** Run `fn` no sooner than the min interval after the previous Nominatim call.
 *  Serialised through a single promise chain so concurrent callers don't all fire at
 *  once. Each task's own failure is isolated — it never poisons the chain. */
export function rateLimited<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const wait = minIntervalMs() - (Date.now() - lastRequestAt)
    if (wait > 0) await new Promise((r) => setTimeout(r, wait))
    lastRequestAt = Date.now()
    return fn()
  })
  // Keep the chain alive regardless of this task's outcome.
  queue = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

/**
 * One rate-limited GET against Nominatim /search. The (caller-supplied) params can
 * only ever land in the query string of a CONSTANT base URL — they can never
 * influence the host or path — so the request is pinned to nominatim.openstreetmap.org
 * by construction (the standard request-forgery remediation). A caller `signal`
 * (a stale keystroke, a disconnected client) both short-circuits before the fetch
 * and aborts an in-flight one.
 *
 * Returns the parsed JSON array, or `null` on ANY miss/failure.
 */
export async function nominatimSearch(
  params: Record<string, string>,
  signal?: AbortSignal,
): Promise<unknown[] | null> {
  return rateLimited(async () => {
    // The slot may have been queued behind other calls; if the caller gave up while
    // we waited, don't spend a Nominatim request on a result no one will read.
    if (signal?.aborted) return null

    const url = new URL(NOMINATIM_SEARCH_URL)
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    const onAbort = () => controller.abort()
    signal?.addEventListener('abort', onAbort)

    let res: Response
    try {
      res = await fetch(url, {
        method: 'GET',
        headers: {
          // Required by Nominatim's usage policy; Accept-Language keeps names English.
          'User-Agent': NOMINATIM_USER_AGENT,
          'Accept-Language': 'en',
          Accept: 'application/json',
        },
        signal: controller.signal,
        // A geocode lookup is one-shot; never let Next cache it.
        cache: 'no-store',
      })
    } catch {
      // Network error, timeout, or abort → graceful miss.
      return null
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
    }

    // 429 (rate-limited), 5xx, or any non-OK → graceful miss.
    if (!res.ok) return null

    try {
      const data = await res.json()
      return Array.isArray(data) ? data : null
    } catch {
      return null
    }
  })
}
