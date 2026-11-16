// SCAN-1210: the last good public_events read, kept per server instance.
//
// public.public_events backs /discover, the city pages and the feed. It hit the statement timeout (57014)
// 576 times between September and November. Before this file a failed read resolved [] and ISR cached the
// empty list for an hour. Now a failed read is never an empty list:
//   - a fresh snapshot (under SNAPSHOT_TTL_MS) is served without touching the database;
//   - a failed read serves the last good snapshot and logs one `[discover] public_events_snapshot stale` line;
//   - a failed read with no snapshot THROWS, so an ISR regeneration fails and the previous page keeps serving.
// The stale and the throw both log under one grep-able tag, so a fail-safe that fired is visible in runtime logs.

const SNAPSHOT_TTL_MS = 60_000
const MAX_STALE_MS = 6 * 60 * 60_000

type Snapshot<T> = { rows: T[]; at: number }
const store = new Map<string, Snapshot<unknown>>()

export class PublicEventsUnavailableError extends Error {
  constructor(key: string) {
    super(`public_events_snapshot: read failed and no snapshot to serve (${key})`)
    this.name = 'PublicEventsUnavailableError'
  }
}

export async function readThroughPublicEventsSnapshot<T>(
  key: string,
  read: () => Promise<{ rows: T[]; ok: boolean }>,
  now: () => number = Date.now,
): Promise<T[]> {
  const hit = store.get(key) as Snapshot<T> | undefined
  if (hit && now() - hit.at < SNAPSHOT_TTL_MS) return hit.rows
  const result = await read()
  if (result.ok) {
    store.set(key, { rows: result.rows, at: now() })
    return result.rows
  }
  if (hit && now() - hit.at < MAX_STALE_MS) {
    console.error(`[discover] public_events_snapshot stale served (${key}), age ${now() - hit.at}ms`)
    return hit.rows
  }
  console.error(`[discover] public_events_snapshot unavailable (${key}), failing the render so ISR keeps the last page`)
  throw new PublicEventsUnavailableError(key)
}

export const __snapshotForTest = { store }
