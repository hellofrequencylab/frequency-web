// Presence thresholds, kept in one place so widgets stay consistent.
// Tuned to the ~90s heartbeat: ONLINE_MS gives ~3 heartbeats of grace before
// a user is marked offline (laptop sleep, brief tab switches, etc).

export const ONLINE_MS  = 5  * 60 * 1000
export const RECENT_MS  = 60 * 60 * 1000

export function isOnline(lastSeenAt: string | null | undefined): boolean {
  if (!lastSeenAt) return false
  return new Date().getTime() - new Date(lastSeenAt).getTime() < ONLINE_MS
}
