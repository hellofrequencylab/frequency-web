// Confirmed-'going' RSVP counts for a set of events — counted in the DATABASE, with a fallback
// that is correct on its own.
//
// WHY THIS MODULE EXISTS. app/(main)/events/index-data.ts read every 'going' row for the whole
// listing (`event_rsvps.select('event_id').in('event_id', eventIds).eq('status','going')`, no
// limit) purely to tally one small integer per event in JS. The listing carries up to
// 3 x SERIES_WIDE_READ = 1,500 events, so the read scaled with TOTAL ATTENDANCE across the catalog
// while the answer stayed one integer per event.
//
// 🔴 AND IT TRUNCATED. PostgREST caps every response at `max_rows` (1,000 — supabase/config.toml),
// SERVER-SIDE; service_role does not escape it and `.limit()` does not raise it. Past 1,000 total
// 'going' rows in one listing the tally silently under-counted with no error to notice, which flips
// the "Has open spots" facet ON for an event that is actually full and mis-orders the Popularity
// sort. Same class as the QR capture count (ADR-969) and the CRM import dedupe (ADR-962).
//
// TWO PATHS, and the fallback is the whole point:
//   1. `event_going_counts(p_event_ids)` — one grouped count per event, computed server-side
//      (supabase/migrations/20270329000000_event_going_counts_rpc.sql).
//   2. If that RPC is ABSENT — the migration file can land before the owner applies it — or errors
//      for any other reason, fall back to the original fetch-and-tally, now PAGED so it is correct
//      at any scale too.
// Path 2 is what makes the migration file safe to merge unapplied: production keeps today's
// behaviour, minus the truncation, until the function exists.
//
// FAIL-SAFE THROUGHOUT. A going-count is social proof and a facet input, never an access decision,
// so every error resolves to the counts gathered so far (worst case an empty map) rather than
// throwing. The listing renders with "0 going" instead of not rendering.

import { createAdminClient } from '@/lib/supabase/admin'

/** Ids per call. Both paths return at most one row per requested id (the RPC groups; the tally
 *  pages), so 500 keeps every RPC response provably under `max_rows` — a response of exactly
 *  max_rows is indistinguishable from a truncated one, and this never gets close. */
export const GOING_ID_CHUNK = 500

/** PostgREST's `max_rows`, and the page size of the fallback read. Matching it exactly means a
 *  short page is an unambiguous end-of-data signal. */
const GOING_PAGE = 1000

/** The RPC's row shape. */
type CountRow = { event_id: string; going: number }

/** `event_going_counts` is newer than the generated DB types (its migration is not applied yet),
 *  so it is reached through a narrow untyped handle — the repo convention for not-yet-regenerated
 *  surfaces (ADR-246). Drop the cast when lib/database.types.ts carries the function. */
type RpcHandle = {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>
}

/** PURE: split ids into chunks of at most `size`, preserving order. */
export function chunkIds(ids: string[], size: number = GOING_ID_CHUNK): string[][] {
  const n = Math.max(1, Math.floor(size))
  const out: string[][] = []
  for (let i = 0; i < ids.length; i += n) out.push(ids.slice(i, i + n))
  return out
}

/** PURE: normalise a caller's id list — trimmed, non-empty, de-duplicated, order preserved. */
export function normalizeEventIds(eventIds: readonly (string | null | undefined)[]): string[] {
  return [...new Set((eventIds ?? []).map((id) => (id ?? '').trim()).filter(Boolean))]
}

/** PURE: fold RPC rows into the counts record the listing consumes. Non-finite or negative counts
 *  are dropped rather than trusted — a count is never allowed to make an event look emptier or
 *  fuller than a real integer could. */
export function foldCountRows(rows: readonly CountRow[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const r of rows) {
    const id = (r?.event_id ?? '').trim()
    const n = Number(r?.going)
    if (!id || !Number.isFinite(n) || n < 0) continue
    out[id] = (out[id] ?? 0) + Math.floor(n)
  }
  return out
}

/** One chunk through the RPC. Returns null when the function is absent or the call fails at all —
 *  the caller then re-does the WHOLE set through the fallback, so a partial RPC result can never be
 *  double-counted on top of a tally. */
async function countChunkViaRpc(chunk: string[]): Promise<CountRow[] | null> {
  try {
    const handle = createAdminClient() as unknown as RpcHandle
    const { data, error } = await handle.rpc('event_going_counts', { p_event_ids: chunk })
    // Any error is treated as "the RPC is unavailable": a missing function (PGRST202, the
    // pre-apply state), a revoked grant, a timeout. All of them mean "count it the old way".
    if (error || !Array.isArray(data)) return null
    return data as CountRow[]
  } catch {
    return null
  }
}

/** The original fetch-and-tally, PAGED. Used only when the RPC is unavailable. */
async function countByPaging(ids: string[]): Promise<Record<string, number>> {
  const counts: Record<string, number> = {}
  try {
    const admin = createAdminClient()
    for (const chunk of chunkIds(ids)) {
      for (let fetched = 0; ; ) {
        const { data, error } = await admin
          .from('event_rsvps')
          .select('event_id')
          .in('event_id', chunk)
          .eq('status', 'going')
          // `id` is the primary key, so this is a TOTAL order. Without it two rows sharing an
          // event_id could straddle a page boundary and be counted twice or not at all.
          .order('id', { ascending: true })
          .range(fetched, fetched + GOING_PAGE - 1)
        if (error) return counts
        const batch = (data ?? []) as { event_id: string }[]
        for (const r of batch) {
          const id = (r?.event_id ?? '').trim()
          if (id) counts[id] = (counts[id] ?? 0) + 1
        }
        // A short page is an unambiguous end-of-data signal: the window is exactly max_rows.
        if (batch.length < GOING_PAGE) break
        fetched += batch.length
      }
    }
  } catch {
    // fail-safe: whatever was tallied stands
  }
  return counts
}

/**
 * Per-event confirmed-'going' counts for `eventIds`. Every requested id that has at least one
 * 'going' RSVP gets an entry; the rest are simply absent (callers read `counts[id] ?? 0`).
 *
 * FAIL-SAFE to `{}` — never throws.
 */
export async function goingCountsByEvent(
  eventIds: readonly (string | null | undefined)[],
): Promise<Record<string, number>> {
  const ids = normalizeEventIds(eventIds)
  if (ids.length === 0) return {}

  const chunks = chunkIds(ids)
  const results = await Promise.all(chunks.map((chunk) => countChunkViaRpc(chunk)))
  if (results.every((rows): rows is CountRow[] => rows !== null)) {
    return foldCountRows(results.flat())
  }
  return countByPaging(ids)
}
