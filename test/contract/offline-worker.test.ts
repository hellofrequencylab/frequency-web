import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

// ── The service worker's offline half (LIVE-702, ADR-1638) ─────────────────────────────────────
//
// public/sw.js is a plain script the browser runs, not a module the app imports, so it is loaded
// here the way a browser loads it: evaluated in its own global scope, with `self`, `caches` and
// `fetch` supplied. Its top-level function declarations (offlineStrategy, isCacheableResponse,
// isStaleCache) are then the pure decision functions, and its listeners are driven with fake
// events for the end-to-end paths.
//
// The two promises this pins, both of which a green build would never notice breaking:
//   1. a page load with no network gets public/offline.html, not the browser's error page;
//   2. no page and no API response is ever written to a cache (stale member data, or another
//      member's, is worse than offline).

const ROOT = path.join(__dirname, '..', '..')
const WORKER = readFileSync(path.join(ROOT, 'public', 'sw.js'), 'utf8')
const OFFLINE_PAGE = readFileSync(path.join(ROOT, 'public', 'offline.html'), 'utf8')
const ORIGIN = 'https://frequency.test'

type Listener = (event: unknown) => void
type FakeRequest = { url: string; method: string; mode: string; headers: Headers }
type FetchImpl = (req: FakeRequest | { url: string }) => Promise<Response>

function req(pathOrUrl: string, init: { method?: string; mode?: string; headers?: Record<string, string> } = {}): FakeRequest {
  return {
    url: new URL(pathOrUrl, ORIGIN).href,
    method: init.method ?? 'GET',
    mode: init.mode ?? 'no-cors',
    headers: new Headers(init.headers ?? {}),
  }
}

/** A same-origin network response, as `fetch` in a worker would hand it back. */
function basic(body: string, init: ResponseInit = {}): Response {
  const res = new Response(body, { status: 200, ...init })
  Object.defineProperty(res, 'type', { value: 'basic' })
  return res
}

function loadWorker(fetchImpl: FetchImpl) {
  const listeners: Record<string, Listener[]> = {}
  const store = new Map<string, Map<string, Response>>()
  const keyOf = (r: string | { url: string }) => (typeof r === 'string' ? new URL(r, ORIGIN).href : r.url)
  const cacheFor = (entries: Map<string, Response>) => ({
    match: async (r: string | { url: string }) => entries.get(keyOf(r))?.clone(),
    put: async (r: { url: string }, res: Response) => void entries.set(keyOf(r), res),
    addAll: async (reqs: { url: string }[]) => {
      for (const r of reqs) {
        const res = await fetchImpl(r)
        if (!res.ok) throw new TypeError('addAll: bad response')
        entries.set(keyOf(r), res)
      }
    },
    keys: async () => [...entries.keys()].map((url) => ({ url })),
    delete: async (r: string | { url: string }) => entries.delete(keyOf(r)),
  })
  const caches = {
    open: async (name: string) => {
      if (!store.has(name)) store.set(name, new Map())
      return cacheFor(store.get(name)!)
    },
    keys: async () => [...store.keys()],
    delete: async (name: string) => store.delete(name),
  }
  class WorkerRequest {
    url: string
    method = 'GET'
    constructor(u: string, public init: RequestInit = {}) {
      this.url = new URL(u, ORIGIN).href
    }
  }
  const ctx = vm.createContext({
    console: { ...console, warn: () => {} },
    URL,
    Headers,
    Response,
    Request: WorkerRequest,
    Promise,
    caches,
    fetch: fetchImpl,
  }) as Record<string, unknown>
  ctx.self = Object.assign(ctx, {
    location: { origin: ORIGIN },
    addEventListener: (type: string, fn: Listener) => void (listeners[type] ??= []).push(fn),
    skipWaiting: async () => {},
    clients: { claim: async () => {}, matchAll: async () => [] },
    registration: { showNotification: async () => {} },
  })
  vm.runInContext(WORKER, ctx, { filename: 'public/sw.js' })

  async function lifecycle(type: 'install' | 'activate') {
    const waits: Promise<unknown>[] = []
    for (const fn of listeners[type] ?? []) fn({ waitUntil: (p: Promise<unknown>) => waits.push(p) })
    await Promise.all(waits)
  }

  async function dispatchFetch(request: FakeRequest): Promise<Response | undefined> {
    let responded: Promise<Response> | undefined
    const waits: Promise<unknown>[] = []
    const event = {
      request,
      respondWith: (p: Promise<Response>) => void (responded = Promise.resolve(p)),
      waitUntil: (p: Promise<unknown>) => void waits.push(p),
    }
    for (const fn of listeners.fetch ?? []) fn(event)
    const res = responded ? await responded : undefined
    await Promise.all(waits)
    return res
  }

  /** Every URL held in any cache, for the "never stored" assertions. */
  const storedUrls = () => [...store.values()].flatMap((m) => [...m.keys()])

  return {
    ctx,
    listeners,
    store,
    storedUrls,
    lifecycle,
    dispatchFetch,
    strategy: (r: FakeRequest) => (ctx.offlineStrategy as (r: FakeRequest, o: string) => string)(r, ORIGIN),
    cacheable: (r: unknown) => (ctx.isCacheableResponse as (r: unknown) => boolean)(r),
    stale: (n: string) => (ctx.isStaleCache as (n: string) => boolean)(n),
    constant: (name: string) => vm.runInContext(name, ctx) as unknown,
  }
}

/** The network a member has while signal holds: offline.html and the icon from public/, 200 elsewhere. */
const online: FetchImpl = async (r) => {
  const { pathname } = new URL(r.url)
  if (pathname === '/offline.html') return basic(OFFLINE_PAGE, { headers: { 'content-type': 'text/html' } })
  return basic(`body of ${pathname}`, { headers: { 'cache-control': 'public, max-age=31536000, immutable' } })
}
const offline: FetchImpl = async () => {
  throw new TypeError('Failed to fetch')
}

describe('offlineStrategy: the one routing decision', () => {
  const w = loadWorker(online)

  it('sends a same-origin page load down the network-first-then-offline-page path', () => {
    expect(w.strategy(req('/feed', { mode: 'navigate' }))).toBe('navigate')
    expect(w.strategy(req('/', { mode: 'navigate' }))).toBe('navigate')
  })

  it('stores only content-hashed build files and public brand files', () => {
    expect(w.strategy(req('/_next/static/chunks/app-abc123.js'))).toBe('immutable')
    expect(w.strategy(req('/_next/static/media/nunito.woff2'))).toBe('immutable')
    expect(w.strategy(req('/icons/icon-192.png'))).toBe('asset')
    expect(w.strategy(req('/images/hero.jpg'))).toBe('asset')
  })

  it('leaves API calls, RSC fetches, image proxying, data routes and media ranges to the network', () => {
    expect(w.strategy(req('/api/me'))).toBe('network')
    expect(w.strategy(req('/api/me', { mode: 'cors' }))).toBe('network')
    expect(w.strategy(req('/feed?_rsc=1x', { mode: 'cors', headers: { rsc: '1' } }))).toBe('network')
    expect(w.strategy(req('/_next/image?url=%2Fsigned%2Fprivate.jpg&w=640'))).toBe('network')
    expect(w.strategy(req('/_next/data/build/feed.json'))).toBe('network')
    expect(w.strategy(req('/_next/static/chunks/a.js', { headers: { range: 'bytes=0-' } }))).toBe('network')
    expect(w.strategy(req('/tracks/rain.mp3', { headers: { range: 'bytes=0-' } }))).toBe('network')
  })

  it('never touches a non-GET or another origin, even as a page load', () => {
    expect(w.strategy(req('/feed', { mode: 'navigate', method: 'POST' }))).toBe('network')
    expect(w.strategy(req('/_next/static/chunks/a.js', { method: 'POST' }))).toBe('network')
    expect(w.strategy(req('https://abc.supabase.co/rest/v1/profiles'))).toBe('network')
    expect(w.strategy(req('https://cdn.example.com/_next/static/x.js'))).toBe('network')
  })
})

describe('isCacheableResponse and isStaleCache', () => {
  const w = loadWorker(online)

  it('stores only a full same-origin 200 that its server allows storing', () => {
    expect(w.cacheable(basic('x'))).toBe(true)
    expect(w.cacheable(basic('x', { headers: { 'cache-control': 'private, max-age=60' } }))).toBe(false)
    expect(w.cacheable(basic('x', { headers: { 'cache-control': 'no-store' } }))).toBe(false)
    expect(w.cacheable(basic('x', { status: 206 }))).toBe(false)
    expect(w.cacheable(basic('x', { status: 404 }))).toBe(false)
    expect(w.cacheable(new Response('x'))).toBe(false) // not 'basic': an opaque or synthetic answer
    expect(w.cacheable(undefined)).toBe(false)
  })

  it('marks only our own caches from an earlier version as stale', () => {
    expect(w.constant('OFFLINE_CACHE')).toMatch(/^frequency-offline-v\d+$/)
    expect(w.stale(w.constant('OFFLINE_CACHE') as string)).toBe(false)
    expect(w.stale(w.constant('STATIC_CACHE') as string)).toBe(false)
    expect(w.stale('frequency-offline-v0')).toBe(true)
    expect(w.stale('frequency-static-v0')).toBe(true)
    expect(w.stale('workbox-precache')).toBe(false)
  })
})

describe('the worker end to end', () => {
  it('precaches the offline page at install, and a page load with no signal gets it', async () => {
    let network: FetchImpl = online
    const w = loadWorker((r) => network(r))
    await w.lifecycle('install')
    expect(w.storedUrls()).toContain(`${ORIGIN}/offline.html`)

    network = offline
    const res = await w.dispatchFetch(req('/circles/north-shore', { mode: 'navigate' }))
    expect(res).toBeDefined()
    expect(await res!.text()).toBe(OFFLINE_PAGE)
  })

  it('never stores a page it served from the network', async () => {
    const w = loadWorker(online)
    await w.lifecycle('install')
    const before = w.storedUrls()
    const res = await w.dispatchFetch(req('/feed', { mode: 'navigate' }))
    expect(await res!.text()).toBe('body of /feed')
    expect(w.storedUrls()).toEqual(before)
    expect(w.storedUrls().some((u) => u.endsWith('/feed'))).toBe(false)
  })

  it('does not answer an API call at all, so nothing of it can be stored', async () => {
    const w = loadWorker(online)
    expect(await w.dispatchFetch(req('/api/notifications', { mode: 'cors' }))).toBeUndefined()
    expect(w.storedUrls()).toEqual([])
  })

  it('keeps a build file it has seen working after the signal drops', async () => {
    let network: FetchImpl = online
    const w = loadWorker((r) => network(r))
    const chunk = req('/_next/static/chunks/app-abc123.js')
    expect(await (await w.dispatchFetch(chunk))!.text()).toBe('body of /_next/static/chunks/app-abc123.js')
    network = offline
    expect(await (await w.dispatchFetch(chunk))!.text()).toBe('body of /_next/static/chunks/app-abc123.js')
  })

  it('keeps a brand file it has seen working, but prefers the network while there is one', async () => {
    let network: FetchImpl = online
    const w = loadWorker((r) => network(r))
    const icon = req('/icons/icon-512.png')
    await w.dispatchFetch(icon)
    network = async (r) => basic(`fresh ${new URL(r.url).pathname}`)
    expect(await (await w.dispatchFetch(icon))!.text()).toBe('fresh /icons/icon-512.png')
    network = offline
    expect(await (await w.dispatchFetch(icon))!.text()).toBe('fresh /icons/icon-512.png')
  })

  it('does not store a build file its server marked private', async () => {
    const w = loadWorker(async () => basic('secret', { headers: { 'cache-control': 'private' } }))
    await w.dispatchFetch(req('/_next/static/chunks/x.js'))
    expect(w.storedUrls()).toEqual([])
  })

  it('still installs when the offline page cannot be fetched, and still answers in our voice', async () => {
    const w = loadWorker(offline)
    await expect(w.lifecycle('install')).resolves.toBeUndefined()
    const res = await w.dispatchFetch(req('/feed', { mode: 'navigate' }))
    expect(res!.status).toBe(503)
    const text = await res!.text()
    expect(text).toContain("You're offline")
    expect(text).toContain('Try again')
  })

  it('removes caches from an earlier version on activate and leaves other caches alone', async () => {
    const w = loadWorker(online)
    for (const name of ['frequency-offline-v0', 'frequency-static-v0', 'someone-else']) w.store.set(name, new Map())
    await w.lifecycle('install')
    await w.lifecycle('activate')
    expect([...w.store.keys()].sort()).toEqual([w.constant('OFFLINE_CACHE'), 'someone-else'].sort())
  })

  it('caps the static cache, dropping the oldest entries first', async () => {
    const w = loadWorker(online)
    const max = w.constant('STATIC_CACHE_MAX_ENTRIES') as number
    for (let i = 0; i <= max + 2; i++) await w.dispatchFetch(req(`/_next/static/chunks/c${i}.js`))
    const kept = [...w.store.get(w.constant('STATIC_CACHE') as string)!.keys()]
    expect(kept).toHaveLength(max)
    expect(kept[0]).toBe(`${ORIGIN}/_next/static/chunks/c3.js`)
  })

  it('keeps the push half registered beside the offline half', () => {
    const w = loadWorker(online)
    expect(w.listeners.push).toHaveLength(1)
    expect(w.listeners.notificationclick).toHaveLength(1)
    expect(w.listeners.fetch).toHaveLength(1)
  })
})

describe('public/offline.html', () => {
  it('reads in the product voice and stands alone', () => {
    expect(OFFLINE_PAGE).toContain("<h1>You're offline</h1>")
    expect(OFFLINE_PAGE).toContain('Try again')
    // CONTENT-VOICE hard rule, in the page and in the worker's fallback copy.
    expect(OFFLINE_PAGE).not.toContain('—')
    expect(String(loadWorker(online).constant('OFFLINE_FALLBACK_HTML'))).not.toContain('—')
    // Nothing from the build: a precached page cannot rely on a hashed chunk still existing.
    expect(OFFLINE_PAGE).not.toMatch(/_next\//)
    expect(OFFLINE_PAGE).not.toMatch(/<link[^>]+stylesheet/)
    // Everything it loads is precached with it.
    const precache = loadWorker(online).constant('PRECACHE_URLS') as string[]
    for (const src of OFFLINE_PAGE.matchAll(/src="([^"]+)"/g)) expect(precache).toContain(src[1])
  })
})
