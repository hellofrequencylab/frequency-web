'use client'

import { useEffect } from 'react'
import { pingPresence } from './actions'

const INTERVAL_MS = 90_000

// Fire-and-forget heartbeat that updates the current user's last_seen_at
// while the tab is visible. Renders nothing; mount once in the authenticated
// layout. Pauses while the tab is hidden, fires again on revisit.
export function PresenceHeartbeat() {
  useEffect(() => {
    let cancelled = false

    async function ping() {
      if (cancelled || document.hidden) return
      try { await pingPresence() } catch { /* ignore */ }
    }

    ping()
    const interval = window.setInterval(ping, INTERVAL_MS)

    function onVisibility() {
      if (!document.hidden) ping()
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      cancelled = true
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  return null
}
