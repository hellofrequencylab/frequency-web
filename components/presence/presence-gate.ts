// The presence heartbeat's rate gate (LIVE-649, ADR-1617). PURE, so the heartbeat, its test and the
// backlog probe read the same rule. See components/presence/heartbeat.tsx for why it exists.

/** The heartbeat's schedule while the tab is visible. */
export const INTERVAL_MS = 90_000
/** The closest two pings may ever land, whatever asks for them. */
export const MIN_GAP_MS = 60_000
/** The longest a failing heartbeat waits before trying again. */
export const MAX_BACKOFF_MS = 30 * 60_000

/** May a ping go out at `now`, given the last attempt and how many in a row have failed? */
export function mayPing(now: number, lastAttemptAt: number, failures: number): boolean {
  const wait = failures === 0 ? MIN_GAP_MS : Math.min(INTERVAL_MS * 2 ** failures, MAX_BACKOFF_MS)
  return now - lastAttemptAt >= wait
}
