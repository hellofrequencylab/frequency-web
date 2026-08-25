// Per-event ticket-tier price summaries — aggregated in the DATABASE, with a fallback that is
// correct on its own.
//
// WHY THIS MODULE EXISTS. app/(main)/events/index-data.ts read every ACTIVE tier for the whole
// listing (`event_ticket_types.select(...).in('event_id', eventIds).eq('active', true)`, no bound)
// purely to resolve ONE SHORT STRING per card — "Free" / "$20" / "From $20".
//
// 🔴 AND IT COULD TRUNCATE. PostgREST caps every response at `max_rows` (1,000 —
// supabase/config.toml), SERVER-SIDE; `service_role` does not escape it and `.limit()` does not
// raise it. The listing carries up to 3 x SERIES_WIDE_READ = 1,500 events and tiers scale as
// events x tiers, so the read is bounded by neither. Past 1,000 rows the trailing events lose their
// label with no error to notice, and a ticketed event silently renders "Free" — the same class as
// ADR-962 (CRM import dedupe), ADR-969 (QR capture counts) and SCAN-303 (the going tally).
//
// ⚠️ MEASURED FIRST: production on 2026-08-25 carried 2 active tiers, on 1 event, against 60
// published events. Nothing was truncating. This closes the class BEFORE it fires, which is the
// opposite of the four occurrences above — every one of those was found by its consequence.
//
// 🔴 WHY CHUNKING THE INPUT IS NOT THE FIX HERE. SCAN-303 chunked ids at 500 and that sufficed
// because its RPC returns AT MOST ONE ROW PER ID. Tiers are many-per-event, so chunking the input
// does not bound the response: 500 ids at 5 tiers each is 2,500 rows and truncates just the same.
// The response has to be bounded at the source, which is why path 1 is an AGGREGATE returning one
// row per event, and why path 2 PAGES rather than merely chunking.
//
// TWO PATHS, and the fallback is the point:
//   1. `event_tier_price_summary(p_event_ids)` — one row per event, computed server-side
//      (supabase/migrations/20270332000000_event_tier_price_summary_rpc.sql).
//   2. If that function is ABSENT — the file can land before the owner applies it — or errors for
//      any other reason, fall back to reading the raw tiers, now PAGED, and folding them here.
// Path 2 is what makes the migration safe to merge unapplied.
//
// ✅ THE TWO PATHS CANNOT DRIFT, BY CONSTRUCTION. `eventPriceLabel` — the original function, still
// exported and still the only thing that renders a label — now routes through `summarizeTierRows`
// and `priceLabelFromSummary`. So the fallback path and the legacy call sites compute the label
// from the SAME fold the RPC's columns feed, and a test that pins one pins the other.
//
// FAIL-SAFE THROUGHOUT. A price label is display copy, never an access or payment decision, so
// every error resolves to whatever was gathered (worst case an empty map) rather than throwing. A
// card then falls back to the event's own flat `price_cents`, which the listing already has.

import { createAdminClient } from '@/lib/supabase/admin'

/** Ids per call. The RPC returns at most one row per id, so 500 keeps a response provably under
 *  `max_rows` — a response of exactly max_rows is indistinguishable from a truncated one. */
export const TIER_ID_CHUNK = 500

/** PostgREST's `max_rows`, and the page size of the fallback read. Matching it exactly makes a
 *  short page an unambiguous end-of-data signal. */
const TIER_PAGE = 1000

/** One active tier's price fields, as the fallback reads them. */
export type TierPriceRow = {
  event_id: string
  pricing_mode: string
  price_cents: number | null
  min_cents: number | null
  suggested_cents: number | null
}

/** Everything `eventPriceLabel` needs about one event's tiers — and nothing else.
 *  `minPricedCents` is null when the event HAS tiers but none of them costs anything, which is a
 *  different state from having no tiers at all (that is the absence of a summary). The two render
 *  differently, which is why `tierCount` is carried separately rather than inferred. */
export type TierSummary = {
  tierCount: number
  minPricedCents: number | null
  hasFlexible: boolean
}

/** The RPC's row shape. */
type SummaryRow = {
  event_id: string
  tier_count: number | null
  min_priced_cents: number | null
  has_flexible: boolean | null
}

/** `event_tier_price_summary` is newer than the generated DB types, so it is reached through a
 *  narrow untyped handle — the repo convention for not-yet-regenerated surfaces (ADR-246). */
type RpcHandle = {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>
}

/** PURE: split ids into chunks of at most `size`, preserving order. */
export function chunkIds(ids: string[], size: number = TIER_ID_CHUNK): string[][] {
  const n = Math.max(1, Math.floor(size))
  const out: string[][] = []
  for (let i = 0; i < ids.length; i += n) out.push(ids.slice(i, i + n))
  return out
}

/** PURE: normalise a caller's id list — trimmed, non-empty, de-duplicated, order preserved. */
export function normalizeEventIds(eventIds: readonly (string | null | undefined)[]): string[] {
  return [...new Set((eventIds ?? []).map((id) => (id ?? '').trim()).filter(Boolean))]
}

/** PURE: one tier's effective price in cents, or null when it contributes no floor.
 *  'free' never sets a floor; every other mode takes the first of price/min/suggested that is set,
 *  and only a POSITIVE value counts. Mirrors the original inline expression exactly, and is the
 *  same rule the SQL `case` implements. */
export function tierPricedCents(t: TierPriceRow): number | null {
  if (t.pricing_mode === 'free') return null
  const c = t.price_cents ?? t.min_cents ?? t.suggested_cents ?? 0
  return typeof c === 'number' && Number.isFinite(c) && c > 0 ? c : null
}

/** PURE: fold raw tier rows into one summary per event. The fallback path's aggregate, and the
 *  definition the RPC's columns are checked against. */
export function summarizeTierRows(rows: readonly TierPriceRow[]): Record<string, TierSummary> {
  const out: Record<string, TierSummary> = {}
  for (const t of rows) {
    const id = (t?.event_id ?? '').trim()
    if (!id) continue
    const cur = (out[id] ??= { tierCount: 0, minPricedCents: null, hasFlexible: false })
    cur.tierCount += 1
    if (t.pricing_mode !== 'fixed') cur.hasFlexible = true
    const c = tierPricedCents(t)
    if (c !== null && (cur.minPricedCents === null || c < cur.minPricedCents)) cur.minPricedCents = c
  }
  return out
}

/** PURE: fold RPC rows into the same shape. A row whose count is not a positive integer is dropped
 *  rather than trusted — the summary must never invent tiers an event does not have. */
export function foldSummaryRows(rows: readonly SummaryRow[]): Record<string, TierSummary> {
  const out: Record<string, TierSummary> = {}
  for (const r of rows) {
    const id = (r?.event_id ?? '').trim()
    const n = Number(r?.tier_count)
    if (!id || !Number.isFinite(n) || n < 1) continue
    const min = Number(r?.min_priced_cents)
    out[id] = {
      tierCount: Math.floor(n),
      minPricedCents: Number.isFinite(min) && min > 0 ? Math.floor(min) : null,
      hasFlexible: r?.has_flexible === true,
    }
  }
  return out
}

/** One chunk through the RPC. Returns null when the function is absent or the call fails at all —
 *  the caller then re-does the WHOLE set through the fallback, so a partial RPC result can never be
 *  merged on top of a paged one. */
async function summaryChunkViaRpc(chunk: string[]): Promise<SummaryRow[] | null> {
  try {
    const handle = createAdminClient() as unknown as RpcHandle
    const { data, error } = await handle.rpc('event_tier_price_summary', { p_event_ids: chunk })
    // Any error is "the RPC is unavailable": a missing function (PGRST202, the pre-apply state),
    // a revoked grant, a timeout. All of them mean "summarise it the old way".
    if (error || !Array.isArray(data)) return null
    return data as SummaryRow[]
  } catch {
    return null
  }
}

/** The original read, PAGED and then folded here. Used only when the RPC is unavailable. */
async function summarizeByPaging(ids: string[]): Promise<Record<string, TierSummary>> {
  const rows: TierPriceRow[] = []
  try {
    const admin = createAdminClient()
    for (const chunk of chunkIds(ids)) {
      for (let fetched = 0; ; ) {
        const { data, error } = await admin
          .from('event_ticket_types')
          .select('event_id, pricing_mode, price_cents, min_cents, suggested_cents')
          .in('event_id', chunk)
          .eq('active', true)
          // `id` is the primary key, so this is a TOTAL order. Without it two tiers sharing an
          // event_id could straddle a page boundary and be counted twice or not at all.
          .order('id', { ascending: true })
          .range(fetched, fetched + TIER_PAGE - 1)
        if (error) return summarizeTierRows(rows)
        const batch = (data ?? []) as TierPriceRow[]
        rows.push(...batch)
        // A short page is an unambiguous end-of-data signal: the window is exactly max_rows.
        if (batch.length < TIER_PAGE) break
        fetched += batch.length
      }
    }
  } catch {
    // fail-safe: whatever was read stands
  }
  return summarizeTierRows(rows)
}

/**
 * Per-event tier summaries for `eventIds`. Every requested id with at least one ACTIVE tier gets an
 * entry; the rest are simply absent, and an absent entry means "no tiers, use the event's own flat
 * price" — which is not the same as a present entry whose `minPricedCents` is null ("tiers, all
 * free"). FAIL-SAFE to `{}` — never throws.
 */
export async function tierSummariesByEvent(
  eventIds: readonly (string | null | undefined)[],
): Promise<Record<string, TierSummary>> {
  const ids = normalizeEventIds(eventIds)
  if (ids.length === 0) return {}

  const chunks = chunkIds(ids)
  const results = await Promise.all(chunks.map((chunk) => summaryChunkViaRpc(chunk)))
  if (results.every((rows): rows is SummaryRow[] => rows !== null)) {
    return foldSummaryRows(results.flat())
  }
  return summarizeByPaging(ids)
}

/** Whole-dollar money label — "$20", "$20.50" (cents shown only when non-zero).
 *  Brand voice keeps prices plain, so no trailing ".00". */
export function usd(cents: number): string {
  const dollars = cents / 100
  return cents % 100 === 0 ? `$${dollars}` : `$${dollars.toFixed(2)}`
}

/** PURE: the card's price stat, from a summary. "Free" / "$X" (one fixed price) / "From $X" (a
 *  floor, when the buyer picks among tiers or a flexible mode sets a minimum). A summary wins when
 *  present; otherwise the event's flat `flatCents` (null/0 = free). */
export function priceLabelFromSummary(
  flatCents: number | null,
  summary: TierSummary | undefined,
): string {
  if (summary && summary.tierCount > 0) {
    if (summary.minPricedCents === null) return 'Free'
    // "From" whenever there's a choice of tiers or a flexible mode floors the price.
    const isFloor = summary.tierCount > 1 || summary.hasFlexible
    return isFloor ? `From ${usd(summary.minPricedCents)}` : usd(summary.minPricedCents)
  }
  return flatCents && flatCents > 0 ? usd(flatCents) : 'Free'
}
