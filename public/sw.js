// Frequency service worker.
//
// Minimal v1: handle web push events and notification clicks. No offline
// caching yet — keeping the surface small means fewer bugs while we figure
// out which assets are worth caching.

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
