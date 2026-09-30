// Frequency service worker.
//
// Two jobs, kept apart in this file:
//   1. Web push: the install/activate/push/notificationclick handlers directly below.
//   2. Offline fallback (LIVE-702, ADR-1638): the section at the bottom. A page load
//      with no signal gets the precached /offline.html instead of the browser's error
//      page, and content-hashed build assets a member already loaded keep working.
//
// THE RULE THE OFFLINE HALF EXISTS UNDER: it never caches a page or an API response.
// Every page here can carry one member's data, and a cached copy served later is stale
// member data at best and ANOTHER member's data at worst (a shared phone, a sign-out).
// That is worse than being offline. Pages are network-first with no write-back; only
// public, content-addressed static files are stored.

self.addEventListener('install', (event) => {
  // Activate immediately on first install so push subscriptions work
  // without requiring a tab reload.
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  if (!event.data) return

  let payload
  try {
    payload = event.data.json()
  } catch {
    payload = { title: 'Frequency', body: event.data.text() }
  }

  const title = payload.title || 'Frequency'
  const options = {
    body:   payload.body  || '',
    icon:   '/icons/icon-192.png',
    badge:  '/icons/icon-192.png',
    tag:    payload.tag   || 'frequency-default',
    data:   { url: payload.url || '/feed' },
    renotify: !!payload.renotify,
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = (event.notification.data && event.notification.data.url) || '/feed'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // If a tab is already open, focus it and navigate.
      for (const client of clients) {
        if ('focus' in client) {
          client.focus()
          if ('navigate' in client) client.navigate(targetUrl).catch(() => {})
          return
        }
      }
      // Otherwise open a fresh window.
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl)
      }
    })
  )
})

// ── Offline fallback (LIVE-702, ADR-1638) ───────────────────────────────────────────────
//
// Separate listeners on purpose: the push handlers above stay exactly as they were, and a
// worker may hold several listeners per event (install waits for every waitUntil).
//
// Bump OFFLINE_VERSION whenever offline.html or the precache list changes. Activate deletes
// every `frequency-` cache that is not a current one, so an old offline page never outlives
// the worker that stored it. Caches with another prefix are not ours and are left alone.

const OFFLINE_VERSION = 'v1'
const CACHE_PREFIX = 'frequency-'
const OFFLINE_CACHE = CACHE_PREFIX + 'offline-' + OFFLINE_VERSION
const STATIC_CACHE = CACHE_PREFIX + 'static-' + OFFLINE_VERSION
const CURRENT_CACHES = [OFFLINE_CACHE, STATIC_CACHE]
const OFFLINE_URL = '/offline.html'
const PRECACHE_URLS = [OFFLINE_URL, '/icons/icon-192.png']
// Build output under /_next/static/ is content-hashed: a URL never changes meaning, so a
// stored copy is always right and is served first.
const IMMUTABLE_PREFIXES = ['/_next/static/']
// Public brand files: same for every visitor, but not hashed, so the network wins when it
// answers and the stored copy only covers a dead connection.
const PUBLIC_ASSET_PREFIXES = ['/icons/', '/images/']
const STATIC_CACHE_MAX_ENTRIES = 150

// Used only when the precache itself failed (see install below), so a dead connection still
// gets a sentence in our voice rather than the browser's error page.
const OFFLINE_FALLBACK_HTML =
  '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width, initial-scale=1">' +
  '<title>You\'re offline · Frequency</title></head>' +
  '<body style="font-family:system-ui,sans-serif;padding:2rem;max-width:32rem;margin:auto">' +
  '<h1>You\'re offline</h1><p>This page needs a connection, and your phone doesn\'t have one ' +
  'right now. Once you\'re back, tap Try again.</p>' +
  '<button type="button" onclick="location.reload()">Try again</button></body></html>'

/**
 * The whole routing decision, pure: which strategy a request gets.
 *   'navigate'  a page load: network first, the offline page if the network fails, never stored
 *   'immutable' a content-hashed build file: stored copy first, else network (then stored)
 *   'asset'     a public brand file: network first (then stored), stored copy if the network fails
 *   'network'   everything else, untouched: the worker does not answer, the browser fetches.
 * Anything not a same-origin GET is 'network', which is what keeps API calls, server actions,
 * RSC fetches, /_next/image (it can proxy a signed private file), /_next/data and media ranges
 * out of every cache.
 */
function offlineStrategy(request, origin) {
  if (!request || request.method !== 'GET') return 'network'
  let url
  try {
    url = new URL(request.url)
  } catch {
    return 'network'
  }
  if (url.origin !== origin) return 'network'
  if (request.mode === 'navigate') return 'navigate'
  if (request.headers && typeof request.headers.get === 'function' && request.headers.get('range')) {
    return 'network'
  }
  if (IMMUTABLE_PREFIXES.some((p) => url.pathname.startsWith(p))) return 'immutable'
  if (PUBLIC_ASSET_PREFIXES.some((p) => url.pathname.startsWith(p))) return 'asset'
  return 'network'
}

/** A response may be stored only when it is a full, same-origin 200 its server allows storing. */
function isCacheableResponse(response) {
  if (!response || response.status !== 200 || response.type !== 'basic') return false
  const cacheControl = (response.headers.get('cache-control') || '').toLowerCase()
  return !/\b(no-store|private)\b/.test(cacheControl)
}

/** True for a cache this worker made under an earlier OFFLINE_VERSION. */
function isStaleCache(name) {
  return name.indexOf(CACHE_PREFIX) === 0 && CURRENT_CACHES.indexOf(name) === -1
}

self.addEventListener('install', (event) => {
  // A failed precache must not fail the install: push would go down with it. The navigation
  // handler covers the miss with OFFLINE_FALLBACK_HTML, and the probe on LIVE-702 fails the
  // tree if public/offline.html goes missing.
  event.waitUntil(
    caches
      .open(OFFLINE_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS.map((u) => new Request(u, { cache: 'reload' }))))
      .catch((err) => console.warn('[sw] offline page not precached', err))
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter(isStaleCache).map((name) => caches.delete(name))))
  )
})

self.addEventListener('fetch', (event) => {
  const strategy = offlineStrategy(event.request, self.location.origin)
  if (strategy === 'navigate') event.respondWith(pageOrOffline(event.request))
  else if (strategy === 'immutable') event.respondWith(storedFirst(event))
  else if (strategy === 'asset') event.respondWith(networkThenStored(event))
  // 'network': no respondWith, so the request goes out exactly as if no worker were here.
})

function pageOrOffline(request) {
  // The page response is handed straight back and never written to a cache (see the header).
  return fetch(request).catch(() =>
    caches
      .open(OFFLINE_CACHE)
      .then((cache) => cache.match(OFFLINE_URL))
      .then(
        (hit) =>
          hit ||
          new Response(OFFLINE_FALLBACK_HTML, {
            status: 503,
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
          })
      )
  )
}

function store(event, response) {
  if (!isCacheableResponse(response)) return
  const copy = response.clone()
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.put(event.request, copy).then(() => trim(cache)))
      .catch(() => {})
  )
}

function trim(cache) {
  return cache.keys().then((keys) => {
    const extra = keys.length - STATIC_CACHE_MAX_ENTRIES
    if (extra <= 0) return
    // Cache keys come back in insertion order, so the oldest go first.
    return Promise.all(keys.slice(0, extra).map((key) => cache.delete(key)))
  })
}

function storedFirst(event) {
  return caches
    .open(STATIC_CACHE)
    .then((cache) => cache.match(event.request))
    .then(
      (hit) =>
        hit ||
        fetch(event.request).then((response) => {
          store(event, response)
          return response
        })
    )
}

function networkThenStored(event) {
  return fetch(event.request)
    .then((response) => {
      store(event, response)
      return response
    })
    .catch(() =>
      caches
        .open(STATIC_CACHE)
        .then((cache) => cache.match(event.request))
        .then((hit) => hit || Response.error())
    )
}
