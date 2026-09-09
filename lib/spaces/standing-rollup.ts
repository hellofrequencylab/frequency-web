// SPACE STANDING, the nightly rollup (LIVE-263 - docs/CORE-MODEL.md Phase 10). The v1 half of the
// earned-exposure score: once a night, compute all six signals for every active Space and write
// them, plus the resolved score, to `space_standing` (migration 20270345002900).
//
// WHY A ROLLUP AT ALL. The directory can afford three grouped counts per page render (that is v0,
// LIVE-262, and it still runs live so the freshest numbers win). It cannot afford to scan every
// Space's whole event history and circle list on every browse. Those are the two signals this job
// exists to supply: `gatherings_held` needs the PAST event window, `rooms` needs a whole extra
// table. Everything else is recomputed here anyway so the stored row is internally consistent and
// the operator receipt page can read one row rather than five queries.
//
// WHERE IT RUNS: app/api/cron/refresh-traits, beside the trait / resonance-edge / embedding /
// density steps, as the same kind of best-effort nightly rebuild.
//
// FAIL-SAFE, AND NOT SILENT ABOUT IT. Any error is caught and returned as `error`, the way
// lib/resonance/density.ts had to be taught to do (finding R2, 2026-09-04) after a rollup failed
// silently every night for two weeks because "wrote nothing" and "failed" were the same return
// value. The cron logs a failure at error level; the directory meanwhile degrades to v0 on its own,
// because an unreadable or empty `space_standing` simply means those two signals were not measured
// and the score renormalises over the four that were.
//
// 🔴 NO PAID SIGNAL. Nothing in this file reads a plan, tier, entitlement, seat, price or Stripe
// field, and the score it calls (lib/spaces/standing.ts) cannot: it is pure, imports nothing, and a
// source-shape test fails on any commercial token in it. Exposure is earned, never sold.
//
// authz-delegated: the WRITE is a platform-wide nightly rollup with no per-caller scope, exactly
// like the trait / edge / density refresh beside it. The cron route is the gate
// (rejectUnauthorizedCron); the table is service-role only.

import { createAdminClient } from '@/lib/supabase/admin'
import { SERIES_COLUMNS, countSeriesBy, type SeriesRow } from '@/lib/events/series'
import { LISTABLE_CIRCLE_STATUS } from '@/lib/circles/visibility'
import { readProfileData } from './profile-data'
import { careScore, standingScore, type StandingResult } from './standing'

/** How far back `gatherings_held` looks. A year of hosting is the window that separates a Space
 *  that gathers from one that gathered once in 2024; the saturation curve then flattens anything
 *  past a handful, so a longer window would not change an order, only a cost. */
export const HELD_WINDOW_DAYS = 365

/** A defensive ceiling on the Spaces one pass rebuilds, so the job can never scan an unbounded
 *  table. Generous against any realistic count (22 Spaces exist as of 2026-09-08). */
export const ROLLUP_SPACE_LIMIT = 2000

/** What one nightly pass did. `spaces` is the number of rows written. */
export interface StandingRollupResult {
  /** Rows upserted into space_standing. 0 on failure. */
  spaces: number
  /** The error message when the rollup failed. Absent on success. */
  error?: string
}

/** The message out of whatever supabase-js or the runtime handed back, never an empty string.
 *  Mirrors lib/resonance/density.ts so both nightly rollups report failures the same way. */
function errorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message
  if (err && typeof err === 'object') {
    const e = err as { message?: unknown; code?: unknown; details?: unknown }
    if (typeof e.message === 'string' && e.message) {
      return typeof e.code === 'string' && e.code ? `${e.code}: ${e.message}` : e.message
    }
    if (typeof e.details === 'string' && e.details) return e.details
  }
  const s = String(err)
  return s && s !== '[object Object]' ? s : 'space standing rollup failed (no message)'
}

/** The loose builder shape every read below chains. None of these tables is fully in the generated
 *  types (ADR-246), so the admin client is reached untyped, the same way lib/spaces/discovery.ts
 *  does it. */
type LooseQuery = {
  select: (cols: string) => LooseQuery
  eq: (col: string, val: string | boolean | number) => LooseQuery
  neq: (col: string, val: string) => LooseQuery
  in: (col: string, vals: readonly string[]) => LooseQuery
  or: (filter: string) => LooseQuery
  gt: (col: string, val: string) => LooseQuery
  gte: (col: string, val: string) => LooseQuery
  lt: (col: string, val: string) => LooseQuery
  limit: (n: number) => LooseQuery
  then: (resolve: (r: { data: unknown[] | null; error: unknown }) => unknown) => Promise<unknown>
}

function table(name: string): LooseQuery {
  const db = createAdminClient() as unknown as { from: (t: string) => LooseQuery }
  return db.from(name)
}

/** The Space columns the rollup needs: the id, and everything `care` is read from. */
const SPACE_COLS = 'id, tagline, brand_logo_url, cover_image_url, preferences'

type SpaceRow = {
  id: string
  tagline: string | null
  brand_logo_url: string | null
  cover_image_url: string | null
  preferences: unknown
}

/** Tally rows into a per-space count. */
function tally(rows: readonly Record<string, unknown>[], key: string): Map<string, number> {
  const out = new Map<string, number>()
  for (const row of rows) {
    const id = row[key]
    if (typeof id !== 'string') continue
    out.set(id, (out.get(id) ?? 0) + 1)
  }
  return out
}

/**
 * Rebuild `space_standing` for every ACTIVE, non-root Space. Returns how many rows were written.
 *
 * It covers every active Space, not only the networked ones the directory lists: a walled Space's
 * operator still opens the receipt page and still deserves to see where they stand, and the number
 * has to exist before they decide to list.
 *
 * Six grouped reads over the resolved id set (no N+1), then one batched upsert. The score is the
 * SAME pure function the directory calls, so a Space's stored standing and its live standing differ
 * only by which signals each reader could measure, never by formula.
 */
export async function refreshSpaceStanding(): Promise<StandingRollupResult> {
  try {
    const now = new Date()
    const nowIso = now.toISOString()
    const heldFromIso = new Date(now.getTime() - HELD_WINDOW_DAYS * 86_400_000).toISOString()

    // ── 1. The Spaces to score ──────────────────────────────────────────────────────────────────
    const spacesRes = (await table('spaces')
      .select(SPACE_COLS)
      .eq('status', 'active')
      .neq('type', 'root')
      .limit(ROLLUP_SPACE_LIMIT)) as { data: SpaceRow[] | null; error: unknown }
    if (spacesRes.error) return { spaces: 0, error: errorMessage(spacesRes.error) }
    const spaces = spacesRes.data ?? []
    if (spaces.length === 0) return { spaces: 0 }
    const ids = spaces.map((s) => s.id)

    // ── 2. The five counted signals, one grouped read each ──────────────────────────────────────
    const [heldRes, upcomingRes, roomsRes, audienceRes, commonsRes] = await Promise.all([
      // Gatherings HELD: published, not cancelled, already started, inside the trailing window.
      // OCCURRENCES, not series, and that is deliberate: a weekly circle that met nine times
      // gathered nine times. `upcoming` folds instead, because there the question is "how many
      // distinct things are on the calendar", not "how many times did you show up".
      table('events')
        .select('space_id')
        .eq('is_cancelled', false)
        .eq('status', 'published')
        .gte('starts_at', heldFromIso)
        .lt('starts_at', nowIso)
        .in('space_id', ids) as unknown as Promise<{ data: Record<string, unknown>[] | null; error: unknown }>,
      // Gatherings AHEAD, folded so a materialised recurring series counts once (LIVE-198). The
      // series columns ride along for the fold, exactly as the directory's own read does.
      table('events')
        .select(`space_id, id, starts_at, ${SERIES_COLUMNS}`)
        .eq('is_cancelled', false)
        .eq('status', 'published')
        .gt('starts_at', nowIso)
        .in('space_id', ids) as unknown as Promise<{
        data: (SeriesRow & { space_id: string | null })[] | null
        error: unknown
      }>,
      // Rooms: LISTED, joinable Circles. Axis 1 spelled the way lib/circles/visibility.ts spells it
      // (a NULL `unlisted` is a LISTED row, so a bare .eq('unlisted', false) would be wrong).
      table('circles')
        .select('space_id')
        .in('status', [...LISTABLE_CIRCLE_STATUS])
        .or('unlisted.is.null,unlisted.eq.false')
        .in('space_id', ids) as unknown as Promise<{ data: Record<string, unknown>[] | null; error: unknown }>,
      table('space_follows').select('space_id').in('space_id', ids) as unknown as Promise<{
        data: Record<string, unknown>[] | null
        error: unknown
      }>,
      table('space_members').select('space_id').eq('status', 'active').in('space_id', ids) as unknown as Promise<{
        data: Record<string, unknown>[] | null
        error: unknown
      }>,
    ])

    // A signal whose read FAILED is left unmeasured rather than written as zero, so one broken
    // table degrades the score instead of falsely reporting an empty Space. `null` here means
    // exactly what it means in lib/spaces/standing.ts: not measured.
    const held = heldRes.error || !heldRes.data ? null : tally(heldRes.data, 'space_id')
    const upcoming =
      upcomingRes.error || !upcomingRes.data
        ? null
        : countSeriesBy(upcomingRes.data, (row) => row.space_id)
    const rooms = roomsRes.error || !roomsRes.data ? null : tally(roomsRes.data, 'space_id')
    const audience = audienceRes.error || !audienceRes.data ? null : tally(audienceRes.data, 'space_id')
    const commons = commonsRes.error || !commonsRes.data ? null : tally(commonsRes.data, 'space_id')

    // ── 3. Score, in the one place standing is defined ──────────────────────────────────────────
    const rows = spaces.map((s) => {
      const profile = readProfileData(s.preferences)
      const care = careScore({
        tagline: s.tagline,
        logoUrl: s.brand_logo_url,
        coverUrl: s.cover_image_url,
        subject: profile.subject ?? null,
        about: profile.about ?? null,
        offerings: profile.offerings?.length ?? 0,
        socials: profile.socials?.length ?? 0,
      })
      const result = standingScore({
        gatherings: held ? held.get(s.id) ?? 0 : null,
        upcoming: upcoming ? upcoming.get(s.id) ?? 0 : null,
        rooms: rooms ? rooms.get(s.id) ?? 0 : null,
        audience: audience ? audience.get(s.id) ?? 0 : null,
        commons: commons ? commons.get(s.id) ?? 0 : null,
        care,
      })
      return {
        space_id: s.id,
        gatherings_held: held?.get(s.id) ?? 0,
        upcoming_gatherings: upcoming?.get(s.id) ?? 0,
        rooms: rooms?.get(s.id) ?? 0,
        audience: audience?.get(s.id) ?? 0,
        commons: commons?.get(s.id) ?? 0,
        care: care ?? 0,
        standing_score: result.score,
        computed_at: nowIso,
      }
    })

    // ── 4. One batched upsert (never delete-then-insert: a reader mid-rebuild must still see a
    //       row, and the set of Spaces only grows) ─────────────────────────────────────────────
    const admin = createAdminClient() as unknown as {
      from: (t: string) => {
        upsert: (
          values: unknown[],
          opts: { onConflict: string },
        ) => Promise<{ error: unknown }>
      }
    }
    const { error: writeError } = await admin
      .from('space_standing')
      .upsert(rows, { onConflict: 'space_id' })
    if (writeError) return { spaces: 0, error: errorMessage(writeError) }

    return { spaces: rows.length }
  } catch (err) {
    return { spaces: 0, error: errorMessage(err) }
  }
}

// ── The single-Space read, for the operator receipt page (LIVE-265) ──────────────────────────────

/** One Space's standing as the receipt page reads it. */
export interface SpaceStandingRow {
  /** The six raw counts, exactly as the rollup wrote them. */
  gatheringsHeld: number
  upcomingGatherings: number
  rooms: number
  audience: number
  commons: number
  /** Public-page completeness, 0..1. */
  care: number
  /** When the nightly rollup last computed this row. */
  computedAt: string | null
  /** The resolved score + per-signal detail, re-derived from the stored counts through the SAME
   *  pure function the directory calls. Re-derived rather than read back so the page can explain
   *  each signal, and so a stale stored score can never contradict the counts beside it. */
  detail: StandingResult
}

/**
 * Read one Space's standing from the nightly rollup. Returns null when the rollup has no row yet
 * (pre-migration, a brand-new Space, or before the first nightly pass) so the caller can say
 * "not measured yet" rather than print six confident zeros. FAIL-SAFE: null on any error.
 */
export async function readSpaceStanding(spaceId: string): Promise<SpaceStandingRow | null> {
  if (!spaceId) return null
  try {
    const res = (await table('space_standing')
      .select('space_id, gatherings_held, upcoming_gatherings, rooms, audience, commons, care, computed_at')
      .eq('space_id', spaceId)
      .limit(1)) as { data: Record<string, unknown>[] | null; error: unknown }
    if (res.error || !res.data || res.data.length === 0) return null
    const r = res.data[0]
    const n = (k: string) => Number(r[k]) || 0
    const counts = {
      gatheringsHeld: n('gatherings_held'),
      upcomingGatherings: n('upcoming_gatherings'),
      rooms: n('rooms'),
      audience: n('audience'),
      commons: n('commons'),
      care: n('care'),
    }
    return {
      ...counts,
      computedAt: typeof r.computed_at === 'string' ? r.computed_at : null,
      detail: standingScore({
        gatherings: counts.gatheringsHeld,
        upcoming: counts.upcomingGatherings,
        rooms: counts.rooms,
        audience: counts.audience,
        commons: counts.commons,
        care: counts.care,
      }),
    }
  } catch {
    return null
  }
}
