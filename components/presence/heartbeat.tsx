'use client'

import { useEffect } from 'react'
import { pingPresence } from './actions'

const INTERVAL_MS = 90_000
/** The closest two pings may ever land, whatever asks for them (LIVE-649, ADR-1617). */
export const MIN_GAP_MS = 60_000
/** The longest a failing heartbeat waits before trying again. */
export const MAX_BACKOFF_MS = 30 * 60_000

// Fire-and-forget heartbeat that updates the current user's last_seen_at
// while the tab is visible. Renders nothing; mount once in the authenticated
// layout. Pauses while the tab is hidden, fires again on revisit.
//
// 🔴 EVERY PING IS A SERVER ACTION, AND A SERVER ACTION IS NOT CHEAP ON THE CLIENT (LIVE-649). When
// an action's response says cookies changed, the router drops its prefetch cache, re-renders the
// page and prefetches every visible Link again. So the heartbeat is the clock for that whole fan-out,
// and it must never tick faster than MIN_GAP_MS, however it is asked:
//   · the gate is MODULE state, not component state, so a remount (a layout that re-mounts on each
//     refresh, a key that changes) cannot re-ping on mount;
//   · a visibility flap (a window toggling occlusion, a phone waking) pings once, not once per flap;
//   · a failing ping (a stale action id on a tab left open across deploys) backs off, doubling up
//     to MAX_BACKOFF_MS, instead of failing on schedule forever.
let lastAttemptAt = Number.NEGATIVE_INFINITY
let failures = 0

/** Pure: may a ping go out at `now`? Exported for the test. */
export function mayPing(now: number, last: number, failed: number): boolean {
  const wait = failed === 0 ? MIN_GAP_MS : Math.min(INTERVAL_MS * 2 ** failed, MAX_BACKOFF_MS)
  return now - last >= wait
}

/** Test seam: forget the module-level gate between cases. */
export function resetPresenceGateForTests(): void {
  lastAttemptAt = Number.NEGATIVE_INFINITY
  failures = 0
}

export function PresenceHeartbeat() {
  useEffect(() => {
    let cancelled = false

    async function ping() {
      if (cancelled || document.hidden) return
      const now = Date.now()
      if (!mayPing(now, lastAttemptAt, failures)) return
      lastAttemptAt = now
      try {
        await pingPresence()
        failures = 0
      } catch {
        failures += 1
      }
    }

    void ping()
    const interval = window.setInterval(() => void ping(), INTERVAL_MS)

    function onVisibility() {
      if (!document.hidden) void ping()
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
