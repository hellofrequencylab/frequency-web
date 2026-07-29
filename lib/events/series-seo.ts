import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { HOME_TZ, dayInZone } from '@/lib/time/zone'
import {
  DEFAULT_INDEXED_OCCURRENCES,
  SERIES_COLUMNS,
  collapseSeries,
  isSeriesCadence,
  seriesKey,
  seriesUpcomingFloor,
} from './series'

// The CRAWL side of the series fold (ADR-897). Browse stopped flooding when the read edges started
// calling collapseSeries; the sitemap, the robots directives and /llms.txt did not, so a weekly
// cowork series still advertised ~9 near-identical URLs and a daily one ~61, each with its own OG
// image entry. Google's own duplicate handling then picks a winner for us, and the one it picks is
// routinely a mid-series date rather than the series page a member should land on.
//
// THREE THINGS LIVE HERE AND NOWHERE ELSE:
//   1. THE CRAWL GATE, written once. When this module was built, `public_events`
//      (20260612020000_public_events_price.sql:33-36) filtered ONLY `is_cancelled = false AND
//      starts_at >= now()` — no visibility, no status, no removed_at — so the sitemap had been
//      advertising unlisted and draft events, and events a moderator removed, since that RPC
//      shipped. Rather than loosen a SECURITY DEFINER WHERE clause other callers depend on, this
//      module read `events` directly under the full gate. ADR-903 has since narrowed the RPC to the
//      same shape, so the two agree; this reader stays direct because it also needs the recurrence
//      columns the RPC does not project. The gate here is never wider than the RPC's.
//   2. THE ORDINAL. A row's position among the still-live dates of its series, 0 = the earliest one
//      (the series home). Robots directives are a pure function of that number.
//   3. THE ONE-OFF SHORT CIRCUIT. `events.recurrence_type` is `text NOT NULL DEFAULT 'none'`
//      (20240208000000_event_recurrence.sql:22), so a one-off's value is the TRUTHY string 'none'.
//      An earlier draft branched on `!row.recurrence_type`, which is never true, and would have run
//      two count queries in generateMetadata for every ordinary event on the hottest public page.
//      `seriesSeoFacts` answers a one-off with ZERO reads, from the row the caller already had.

/** Ceiling on the rows the sitemap reader pulls before folding. A post-query fold spends the LIMIT
 *  on rows it discards, and one daily series is ~61 of them, so the crawl read is deliberately wide.
 *  2000 rows is ~7 daily series' worth of headroom over the whole upcoming public set. */
export const SITEMAP_EVENT_ROW_CAP = 2000

/** Cap on the rows `countUpcomingPublicSeries` scans. Same reasoning; the count degrades to a floor
 *  (never an inflated number) if the community ever outgrows it. */
export const SERIES_COUNT_ROW_CAP = 2000

export interface SitemapEventEntry {
  slug: string
  /** ISO instant of the date this URL represents — the sitemap's `lastModified`. */
  startsAt: string
  /** The earliest live date of its series, i.e. the URL a crawler should treat as the series page.
   *  FALSE for every one-off, so `isSeriesHome` is never a synonym for "an event". */
  isSeriesHome: boolean
}

export interface SeriesSeoFacts {
  /** The row belongs to a series at all: it carries a parent, or it is an anchor with a cadence. */
  inSeries: boolean
  /** The row is the series ANCHOR row (`parent_event_id IS NULL` and a real cadence). */
  isAnchor: boolean
  /** Position among the series' still-live dates; 0 = the earliest, i.e. the series home.
   *  `null` for a one-off. A row whose own date has passed counts 0 live dates before it, so a past
   *  anchor lands on 0 — which is the answer we want, see `suppressPastNoindex`. */
  ordinal: number | null
  /** At least one date of this series is still ahead. Only computed when the row itself is past,
   *  because that is the only question it is asked. */
  seriesLive: boolean
}

const ONE_OFF_FACTS: SeriesSeoFacts = { inSeries: false, isAnchor: false, ordinal: null, seriesLive: false }

/** The row `seriesSeoFacts` needs. `generateMetadata` already fetches the event, so it hands this in
 *  and the function costs it nothing extra for the common case. */
export interface SeriesSeoRow {
  id: string
  starts_at: string | null
  recurrence_type?: string | null
  parent_event_id?: string | null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The community wall-clock floor for "still upcoming". Never `new Date()`: at 5:01pm Pacific it is
 *  already tomorrow in UTC, which would drop tonight's gathering out of the sitemap and flip its
 *  page to noindex a few hours early. Same floor browse uses, so crawl and browse agree. */
function upcomingFloor(): string {
  return seriesUpcomingFloor(dayInZone(new Date(), HOME_TZ))
}

/**
 * MAY THIS DATE BE INDEXED? PURE, and the single answer both crawl surfaces are built on: the
 * sitemap decides how many URLs to emit per series with the same number this decides with, so a
 * URL we advertise is never a URL whose page says noindex. That contradiction is the one a crawler
 * resolves in its own favour, not ours.
 *
 * Reads as a whitelist rather than a blacklist on purpose — every `true` below is a stated reason
 * to index, so a future branch that forgets to answer falls through to `false` (quiet) rather than
 * to "index everything".
 *
 *   • a one-off, or a row we could not place (`ordinal: null`, i.e. a read failed) — not our call,
 *     indexed as it is today
 *   • the series ANCHOR at any ordinal — never suppressed by this rule; the series page falling out
 *     of the index while its third date stayed in is the exact inversion ADR-897 exists to fix
 *   • the elected series home (ordinal 0) and the next `indexedOccurrences` dates
 *
 * `indexedOccurrences` counts dates AFTER the home, so 2 means three indexable URLs. 0 is legal
 * and means "the series page only"; a negative or malformed number clamps to 0, never to "all".
 */
export function isOccurrenceIndexed(
  facts: SeriesSeoFacts,
  indexedOccurrences: number = DEFAULT_INDEXED_OCCURRENCES,
): boolean {
  if (!facts.inSeries || facts.ordinal == null) return true
  if (facts.isAnchor) return true
  return facts.ordinal <= allowedOccurrences(indexedOccurrences)
}

/** The allowance, coerced once. A NaN/Infinity means the caller's settings read failed, so fall
 *  back to the shipped recommendation; a negative means someone typed one, so clamp to the floor. */
function allowedOccurrences(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : DEFAULT_INDEXED_OCCURRENCES
}

/**
 * Robots for one occurrence. PURE.
 *
 * Beyond `indexedOccurrences`, a date goes `noindex, follow`: the page stays live, RSVP-able and
 * SELF-canonical, and keeps passing its links (including the visible back-link to the series) up to
 * the series page.
 *
 * 🔴 It must NOT canonicalise to the series page. `rel=canonical` tells Google the URL is a duplicate
 * that should not rank, which would delete the "the next dates are indexed" half of this design and
 * would demote a date that grew its own roster. `noindex, follow` + self-canonical is the exact
 * pairing the page already uses for a past event.
 *
 * The series HOME is never noindexed by this rule, at any ordinal maths — that inversion (the series
 * page falling out of the index while its third date stayed in) is the bug this whole effort exists
 * to fix.
 */
export function seriesRobots(
  facts: SeriesSeoFacts,
  indexedOccurrences: number = DEFAULT_INDEXED_OCCURRENCES,
): { index: false; follow: true } | undefined {
  // `undefined`, not `{ index: true, follow: true }`: an ABSENT robots key inherits the (main)
  // layout's metadata, while a present one REPLACES it wholesale — Next merges nested metadata
  // fields by overwrite, not by merge (node_modules/next/dist/docs/01-app/03-api-reference/
  // 04-functions/generate-metadata.md:1328). Returning a "yes" object here would quietly drop
  // whatever robots fields the layout sets on every indexable event page.
  return isOccurrenceIndexed(facts, indexedOccurrences) ? undefined : { index: false, follow: true }
}

/**
 * Should the page's existing "this event has ended" noindex be CANCELLED? PURE.
 *
 * A long-running series' anchor row keeps its original, now-past `starts_at` forever, so the page
 * that IS the series reads as "ended" while the series meets every Tuesday. Suppressing the past
 * noindex for a live anchor is the D1 fix. A past CHILD is genuinely over and stays noindexed.
 */
export function suppressPastNoindex(facts: SeriesSeoFacts): boolean {
  return facts.isAnchor && facts.seriesLive
}

/**
 * Facts about one event's place in its series, for `generateMetadata`.
 *
 * Costs ZERO queries for a one-off (the overwhelming majority of pages), one `count` for an upcoming
 * occurrence, and two for a past one. Never throws: any error degrades to "not in a series", which
 * leaves the page's existing metadata exactly as it is today.
 */
export async function seriesSeoFacts(row: SeriesSeoRow): Promise<SeriesSeoFacts> {
  const parentId = row.parent_event_id ?? null
  const isAnchor = parentId == null && isSeriesCadence(row.recurrence_type)
  // The short circuit. Branching on `!row.recurrence_type` here would never fire (see the header).
  if (!isAnchor && parentId == null) return ONE_OFF_FACTS

  const key = seriesKey({ id: row.id, starts_at: row.starts_at, parent_event_id: parentId })
  // The key is interpolated into a PostgREST `.or()` expression below, so this is the sanitizer too
  // (same rule as lib/events/series-dates.ts and lib/events/circle-upcoming.ts).
  if (!UUID.test(key) || typeof row.starts_at !== 'string') {
    return { inSeries: true, isAnchor, ordinal: null, seriesLive: false }
  }

  const floor = upcomingFloor()
  try {
    const admin = createAdminClient()
    const live = () =>
      admin
        .from('events')
        .select('id', { count: 'exact', head: true })
        .or(`id.eq.${key},parent_event_id.eq.${key}`)
        .eq('status', 'published')
        .eq('visibility', 'public')
        .eq('is_cancelled', false)
        .is('removed_at', null)
        .gte('starts_at', floor)

    const { count, error } = await live().lt('starts_at', row.starts_at)
    if (error) return { inSeries: true, isAnchor, ordinal: null, seriesLive: false }
    const ordinal = count ?? 0

    // Only a row whose own date has passed needs the second read: for anything still ahead, the row
    // itself proves the series is live. Compared as INSTANTS, never as strings — Postgres emits both
    // `...Z` and `...+00:00` for the same moment and a lexical compare gets that wrong.
    if (Date.parse(row.starts_at) >= Date.parse(floor)) {
      return { inSeries: true, isAnchor, ordinal, seriesLive: true }
    }
    const { count: liveCount } = await live()
    return { inSeries: true, isAnchor, ordinal, seriesLive: (liveCount ?? 0) > 0 }
  } catch {
    return { inSeries: true, isAnchor, ordinal: null, seriesLive: false }
  }
}

/**
 * `seriesSeoFacts` for a caller that does NOT already hold the recurrence columns — today only the
 * /discover twin, which reads through the `public_event_by_slug` RPC and cannot see them. One extra
 * row read on a page that is already canonicalised elsewhere; the hot /events/[slug] path uses the
 * row form above and pays nothing.
 */
export async function seriesSeoFactsBySlug(slug: string): Promise<SeriesSeoFacts> {
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('events')
      .select(`id, starts_at, ${SERIES_COLUMNS}`)
      .eq('slug', slug)
      .maybeSingle()
    if (!data) return ONE_OFF_FACTS
    return await seriesSeoFacts(data as SeriesSeoRow)
  } catch {
    return ONE_OFF_FACTS
  }
}

/**
 * Every event URL the sitemap should advertise: the series page plus its next `occurrences` dates,
 * and one entry per one-off. Fail-safe to `[]` — a data hiccup must never break the sitemap.
 *
 * `occurrences` is the count of dates AFTER the series home, so `occurrences = 2` yields at most
 * three URLs per series (home + 2), whatever the cadence. That is the whole point: a daily series
 * drops from ~61 URLs and ~61 image entries to 3.
 */
export async function listSitemapEventEntries(opts: {
  occurrences?: number
  limit?: number
}): Promise<SitemapEventEntry[]> {
  const occurrences = Number.isFinite(opts.occurrences)
    ? Math.max(0, Math.floor(opts.occurrences as number))
    : DEFAULT_INDEXED_OCCURRENCES
  const limit = Math.max(1, Math.min(Math.floor(opts.limit ?? SITEMAP_EVENT_ROW_CAP), SITEMAP_EVENT_ROW_CAP))

  try {
    const admin = createAdminClient()
    const floor = upcomingFloor()
    const { data, error } = await admin
      .from('events')
      // SERIES_COLUMNS verbatim: without them collapseSeries is a silent no-op and this ships
      // looking finished while the sitemap still carries every date.
      .select(`id, slug, starts_at, is_cancelled, ${SERIES_COLUMNS}`)
      .eq('status', 'published')
      .eq('visibility', 'public')
      .eq('is_cancelled', false)
      .is('removed_at', null)
      .gte('starts_at', floor)
      .order('starts_at', { ascending: true })
      .limit(limit)
    if (error || !Array.isArray(data)) return []

    type Row = {
      id: string
      slug: string | null
      starts_at: string | null
      is_cancelled: boolean | null
      recurrence_type: string | null
      recurrence_until: string | null
      parent_event_id: string | null
    }
    const rows = data as Row[]

    // perSeries = 1 + occurrences: the home, then the next N dates. A one-off is its own group of
    // one and is unaffected by the number.
    const { groups } = collapseSeries(rows, {
      perSeries: 1 + occurrences,
      upcomingFrom: floor,
      maxDates: 1 + occurrences,
    })

    const out: SitemapEventEntry[] = []
    for (const group of groups) {
      group.representatives.forEach((r, i) => {
        if (!r.slug || typeof r.starts_at !== 'string') return
        // isSeriesHome is the ELECTED earliest live row, not "the anchor". A long-running series'
        // anchor row is gone from an upcoming-only read the moment its own date passes; electing the
        // anchor would drop established series out of the sitemap entirely.
        out.push({ slug: r.slug, startsAt: r.starts_at, isSeriesHome: group.recurring && i === 0 })
      })
    }
    return out
  } catch {
    return []
  }
}

/**
 * How many distinct upcoming public series/one-offs a visitor could show up to — the number
 * `/llms.txt` publishes. `null` on any error, so the caller drops the line rather than quoting a
 * wrong figure.
 *
 * The old head count counted ROWS, so one daily cowork series inflated "public gatherings you can
 * show up to" by ~60. Same public gate as the sitemap (narrowed, never widened).
 */
export async function countUpcomingPublicSeries(): Promise<number | null> {
  try {
    const admin = createAdminClient()
    const floor = upcomingFloor()
    const { data, error } = await admin
      .from('events')
      .select('id, starts_at, parent_event_id')
      .eq('status', 'published')
      .eq('visibility', 'public')
      .eq('is_cancelled', false)
      .is('removed_at', null)
      .gte('starts_at', floor)
      .order('starts_at', { ascending: true })
      .limit(SERIES_COUNT_ROW_CAP)
    if (error || !Array.isArray(data)) return null
    const rows = data as { id: string; starts_at: string | null; parent_event_id: string | null }[]
    const keys = new Set<string>()
    for (const r of rows) {
      if (!r.id) continue
      keys.add(seriesKey(r))
    }
    return keys.size
  } catch {
    return null
  }
}
