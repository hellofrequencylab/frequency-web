// The HTML-side series fold (ADR-897) — the twin of the calendar feeds' planCalendarFeed collapse
// (lib/events/ics.ts, ADR-807), for every surface that BROWSES events rather than calendaring them.
//
// Recurrence is MATERIALISED (ADR-007): an occurrence is a real `events` row carrying
// parent_event_id, and the daily cron keeps a 60-day horizon warm. Inside that horizon a daily series
// is ~61 rows, a weekly ~9. The .ics feeds have collapsed those to one RRULE VEVENT since ADR-807, but
// no HTML surface ever did, so /events, /discover, search, the Circle "Upcoming events" block and both
// rail panels each rendered one card per date. In production that meant a single cowork series
// occupying a dozen consecutive cards on the community index, and the fixed 3-slot blocks showing one
// gathering three times.
//
// THIS MODULE IS PURE AND HAS ZERO IMPORTS, deliberately:
//   • zero imports keeps lib/time/zone.ts's tz-lookup dataset out of any client bundle that touches a
//     card, so the module is importable from a client component;
//   • the consequence is it cannot build its own "today in the community's zone" floor, so the CALLER
//     passes `upcomingFrom` in. That is not an oversight, it is the seam.
//
// TWO TRAPS IT EXISTS TO SURVIVE (both cost production bugs before the fold existed):
//   1. THE ANCHOR AGES OUT. Browse filters starts_at >= today, so a long-running series' ANCHOR row is
//      gone from the result set the moment its original date passes; only children remain. Electing
//      "the anchor" would therefore DELETE every established series from the index. The fold keys on
//      seriesKey = parent_event_id ?? id and elects the EARLIEST ROW PRESENT IN THE CALLER'S RESULT.
//   2. ROWS WIN OVER ARITHMETIC. lib/events/recurrence.ts nextOccurrence() computes a date from the
//      cadence; the materialised rows are the truth and can disagree (a cancelled or never-minted
//      occurrence). This module never expands a cadence and never calls nextOccurrence.

/** Cards shown per series on a browse surface. Operator-tunable; this is the zero-config default. */
export const DEFAULT_CARDS_PER_SERIES = 3
/**
 * Cards per series on a FIXED TEASER BLOCK — a rail panel, the Channel strip, a Circle's
 * "Upcoming events" card, a search result list. ONE, and it has to be one.
 *
 * DEFAULT_CARDS_PER_SERIES = 3 is sized for a DEEP list (the /events index shows ~40 cards, so three
 * dates of one series is texture, not a takeover). On a block with three slots it is a no-op: three
 * slots filled by three dates of the same series is EXACTLY the screenshot this work exists to fix.
 * The same reasoning covers a result list, which answers "which gathering", not "which date".
 *
 * Depth is not lost, it moved: the event page's date rail (lib/events/series-dates.ts) carries the
 * other dates, and every block keeps its "See all events" link.
 *
 * ⚠️ Consequence for the operator kill switch (cardsPerSeries = 60): it restores one-card-per-date on
 * the deep lists, NOT on these blocks. A block that shows sixty dates of one series shows nothing
 * else, which is the failure, not the escape from it.
 */
export const TEASER_CARDS_PER_SERIES = 1
/** Dates offered on an event page's series rail. Operator-tunable. */
export const DEFAULT_RAIL_DATES = 5
/** Hard cap on the `dates` array a group carries, so a daily series cannot hand a card 61 entries. */
export const DEFAULT_MAX_DATES = 12
/** Occurrences of a series that get their own indexed URL (the rest stay live but noindex). */
export const DEFAULT_INDEXED_OCCURRENCES = 2

/** The cadences that make a row a series anchor (ADR-007). ONE predicate for the whole repo.
 *  `recurrence_type` is `text NOT NULL DEFAULT 'none'`, so a one-off's value is the TRUTHY string
 *  'none', never null — anything testing `!row.recurrence_type` is wrong. */
export const CADENCES: ReadonlySet<string> = new Set(['daily', 'weekly', 'monthly'])

export function isSeriesCadence(value: string | null | undefined): boolean {
  return typeof value === 'string' && CADENCES.has(value)
}

/** The three columns every folding read MUST add to its SELECT, verbatim. A read that omits them
 *  makes the fold a silent no-op — the single most likely way this ships half-working — so the
 *  wiring tests assert this exact string appears in each caller's select list. */
export const SERIES_COLUMNS = 'recurrence_type, recurrence_until, parent_event_id'

export interface SeriesFields {
  recurrence_type?: string | null
  recurrence_until?: string | null
  parent_event_id?: string | null
}

export interface SeriesRow extends SeriesFields {
  id: string
  starts_at: string | null
  slug?: string | null
  is_cancelled?: boolean | null
}

export function isSeriesAnchor(row: SeriesRow): boolean {
  return row.parent_event_id == null && isSeriesCadence(row.recurrence_type)
}

/** One date in a series, as a card or rail renders it. ONE declaration in the repo. */
export interface SeriesDate {
  id: string
  slug: string | null
  startsAt: string
}

export interface SeriesGroup<T> {
  /** parent_event_id ?? id — stable across the anchor ageing out. */
  key: string
  /** 1..perSeries rows, earliest first. */
  representatives: T[]
  /** Eligible dates, earliest first, capped at maxDates. */
  dates: SeriesDate[]
  /** TRUE eligible count, uncapped — what "and 8 more dates" counts. */
  dateCount: number
  /** dateCount minus the rows actually shown. */
  hiddenCount: number
  recurring: boolean
  /** Provably === key for a series; null for a one-off. */
  anchorId: string | null
  /** Whether the anchor row was in THIS result set. NOT a permission answer. */
  anchorPresent: boolean
}

export interface CollapseOptions {
  perSeries?: number
  /** seriesUpcomingFloor(dayInZone(now, HOME_TZ)) — the caller owns the clock. */
  upcomingFrom?: string
  /** Default true; an undefined is_cancelled always passes. */
  dropCancelled?: boolean
  maxDates?: number
  /**
   * WHICH date represents a series. 'earliest' (the default) is "what's next", the right answer on
   * every upcoming browse surface. 'latest' is "what happened", and exists for exactly one caller:
   * the PAST half of search's partition, where electing the earliest row hands a query the series'
   * opening night from years ago. `dates` stays earliest-first either way.
   */
  elect?: 'earliest' | 'latest'
}

export interface CollapseResult<T> {
  /** Input order, non-representatives removed. Every caller's sort survives byte for byte. */
  rows: T[]
  groups: SeriesGroup<T>[]
  /** Keyed by REPRESENTATIVE row id. Read on the server; pass primitives across the RSC boundary. */
  byRowId: Map<string, SeriesGroup<T>>
}

/** parent_event_id ?? id. The one key. */
export function seriesKey(row: SeriesRow): string {
  return row.parent_event_id ?? row.id
}

/** The wall-clock floor for "still upcoming", from a YYYY-MM-DD day already resolved in the
 *  community's home zone. `events.starts_at` stores the host's wall clock kept as UTC PARTS, so the
 *  floor must be expressed the same way. Never `new Date()`: at 5:01pm Pacific it is already tomorrow
 *  in UTC, and a naive compare drops tonight's 7pm gathering from every listing. */
export function seriesUpcomingFloor(todayInZone: string): string {
  return `${todayInZone}T00:00:00.000Z`
}

/** Parse to an instant. Postgres emits both `...Z` and `...+00:00` for the same moment, so every
 *  comparison goes through Date.parse rather than comparing strings. NaN for anything unparseable. */
function instant(value: string | null | undefined): number {
  return typeof value === 'string' ? Date.parse(value) : NaN
}

function clampPerSeries(value: number | undefined): number {
  // NOT PASSED is the only case that takes the default. An explicitly passed bad number (NaN from a
  // parsed setting, 0, a negative) clamps to the FLOOR of 1 instead, because a malformed operator
  // value must never silently delete every repeating event from browse, and must never silently
  // widen past what the operator asked for either.
  if (value === undefined) return DEFAULT_CARDS_PER_SERIES
  if (typeof value !== 'number' || !Number.isFinite(value)) return 1
  return Math.max(1, Math.floor(value))
}

/**
 * Collapse a flat row list so a repeating series occupies `perSeries` cards instead of one per date.
 *
 * PURE. Returns `rows.filter(...)` in the caller's input order, so any sort already applied survives.
 * A row it cannot place — no id, no parseable `starts_at` — passes through untouched at its input
 * position and joins no group: silent deletion is the worse failure, and a SELECT that forgot `id`
 * must not collapse the whole list to one card (it did, in an early draft).
 */
export function collapseSeries<T extends SeriesRow>(
  rows: T[],
  opts: CollapseOptions = {},
): CollapseResult<T> {
  const perSeries = clampPerSeries(opts.perSeries)
  const maxDates = typeof opts.maxDates === 'number' && opts.maxDates > 0 ? Math.floor(opts.maxDates) : DEFAULT_MAX_DATES
  const dropCancelled = opts.dropCancelled !== false
  const floor = instant(opts.upcomingFrom)

  // Bucket by series key, preserving first-appearance order for the groups list.
  const order: string[] = []
  const buckets = new Map<string, T[]>()
  const passthrough = new Set<number>()

  rows.forEach((row, i) => {
    // A falsy id or an undateable row cannot be grouped or counted. Pass it through.
    if (!row || !row.id || Number.isNaN(instant(row.starts_at))) {
      passthrough.add(i)
      return
    }
    const key = seriesKey(row)
    const bucket = buckets.get(key)
    if (bucket) bucket.push(row)
    else {
      buckets.set(key, [row])
      order.push(key)
    }
  })

  const groups: SeriesGroup<T>[] = []
  const byRowId = new Map<string, SeriesGroup<T>>()
  const keep = new Set<string>()

  for (const key of order) {
    const bucket = buckets.get(key)!

    // Eligible = not cancelled (when the caller opted in) and at or after the floor. Deduped by id:
    // a union read can legitimately deliver the same row twice, and it must count once.
    const seen = new Set<string>()
    const eligible: T[] = []
    for (const row of bucket) {
      if (seen.has(row.id)) continue
      seen.add(row.id)
      if (dropCancelled && row.is_cancelled === true) continue
      if (!Number.isNaN(floor) && instant(row.starts_at) < floor) continue
      eligible.push(row)
    }
    // Every occurrence cancelled or past: the group contributes nothing. The ONLY path on which a
    // series disappears, and only because the caller opted into dropCancelled.
    if (eligible.length === 0) continue

    // Earliest first, by INSTANT. Ties break on id so the order is total and stable.
    const byDate = [...eligible].sort((a, b) => {
      const d = instant(a.starts_at) - instant(b.starts_at)
      return d !== 0 ? d : a.id < b.id ? -1 : a.id > b.id ? 1 : 0
    })

    const anchorRow = bucket.find((r) => isSeriesAnchor(r)) ?? null
    // A row is part of a series if it carries a parent, or it is an anchor with a real cadence.
    const recurring = bucket.some((r) => r.parent_event_id != null || isSeriesAnchor(r))
    // Election order. Sorting `dates` is not enough on its own: a past-events reader needs the LAST
    // date to stand for the series, and reversing the input array would not do it — this fold
    // elects by INSTANT, not by input position.
    const representatives = (opts.elect === 'latest' ? [...byDate].reverse() : byDate).slice(0, perSeries)

    const group: SeriesGroup<T> = {
      key,
      representatives,
      dates: byDate.slice(0, maxDates).map((r) => ({
        id: r.id,
        slug: r.slug ?? null,
        startsAt: r.starts_at as string,
      })),
      dateCount: byDate.length,
      hiddenCount: Math.max(0, byDate.length - representatives.length),
      recurring,
      anchorId: recurring ? key : null,
      anchorPresent: anchorRow != null,
    }
    groups.push(group)
    for (const r of representatives) {
      keep.add(r.id)
      byRowId.set(r.id, group)
    }
  }

  const out = rows.filter((row, i) => (passthrough.has(i) ? true : keep.has(row.id) && !isDuplicate(rows, i)))
  return { rows: out, groups, byRowId }
}

/** True when this exact row id already appeared earlier in the list — so a deduped representative is
 *  emitted once even if the caller's union delivered it twice. */
function isDuplicate<T extends SeriesRow>(rows: T[], index: number): boolean {
  const id = rows[index]?.id
  if (!id) return false
  for (let i = 0; i < index; i++) if (rows[i]?.id === id) return true
  return false
}

/** The rows-only wrapper every simple call site uses. */
export function collapseSeriesRows<T extends SeriesRow>(rows: T[], opts?: CollapseOptions): T[] {
  return collapseSeries(rows, opts).rows
}

/**
 * SEARCH's fold, for a reader that has run TWO reads around the wall-clock floor: `upcoming`
 * ascending from the floor, `past` DESCENDING below it. Each half folds SEPARATELY and the results
 * concatenate, so a still-running series is represented by its NEXT date and a finished one by its
 * LAST.
 *
 * WHY TWO READS AT ALL. Both search readers (app/(main)/search/page.tsx, app/api/search/route.ts)
 * had NO date floor and ordered ascending, so their window was the OLDEST N matching rows from the
 * beginning of time. Folding that single window would elect a series' very first date ever — a
 * worse bug than the duplication, and one that only shows on long-running series. The partition is
 * what lets search keep answering for past events while a live series still leads with its next date.
 *
 * The floor applies to the UPCOMING half only. Passing it to the past half would drop every past
 * row by construction, since "past" is defined as below that same floor.
 */
export function collapseSeriesAroundFloor<T extends SeriesRow>(
  upcoming: T[],
  past: T[],
  limit: number,
  opts: CollapseOptions = {},
): T[] {
  const up = collapseSeriesRows(upcoming, opts)
  // The past half elects the LATEST date it holds. The default election ("what's next") would hand
  // a search for a five-year-old cowork series its opening night, because the fold elects by
  // instant and the oldest row in the window wins.
  const back = collapseSeriesRows(past, { ...opts, upcomingFrom: undefined, elect: 'latest' })
  // The halves are disjoint by starts_at but a SERIES straddles the floor, so a weekly cowork
  // appears in both — once as "next Tuesday" and once as "last Tuesday", in one result list.
  // Dedupe on the series key, keeping the UPCOMING representative: a live series must never be
  // shown by a date that already happened.
  const live = new Set(up.map((row) => seriesKey(row)))
  const merged = [...up, ...back.filter((row) => !live.has(seriesKey(row)))]
  const cap = typeof limit === 'number' && limit > 0 ? Math.floor(limit) : 1
  return merged.slice(0, cap)
}

/**
 * The next dates of ONE series, for an event page's rail. The caller has already fetched the sibling
 * rows through its own gates (this module never fetches). Earliest first, deduped, cancelled excluded,
 * capped at `limit`.
 */
export function seriesDates<T extends SeriesRow>(
  rows: T[],
  opts: { upcomingFrom?: string; limit?: number; dropCancelled?: boolean } = {},
): SeriesDate[] {
  const limit = typeof opts.limit === 'number' && opts.limit > 0 ? Math.floor(opts.limit) : DEFAULT_RAIL_DATES
  const dropCancelled = opts.dropCancelled !== false
  const floor = instant(opts.upcomingFrom)
  const seen = new Set<string>()
  const out: SeriesDate[] = []
  for (const row of rows) {
    if (!row || !row.id || seen.has(row.id)) continue
    const at = instant(row.starts_at)
    if (Number.isNaN(at)) continue
    if (dropCancelled && row.is_cancelled === true) continue
    if (!Number.isNaN(floor) && at < floor) continue
    seen.add(row.id)
    out.push({ id: row.id, slug: row.slug ?? null, startsAt: row.starts_at as string })
  }
  return out
    .sort((a, b) => {
      const d = instant(a.startsAt) - instant(b.startsAt)
      return d !== 0 ? d : a.id < b.id ? -1 : a.id > b.id ? 1 : 0
    })
    .slice(0, limit)
}

/** A post-query fold spends the query LIMIT on rows it then discards, so a folding read must
 *  over-fetch. Multiplier, not a guess: one daily series can occupy 61 rows of the budget. */
export const SERIES_FETCH_MULTIPLIER = 10
/** Ceiling on a DISPLAY-sized over-fetch, so a 3-slot block never reads the whole table. */
export const SERIES_FETCH_CEILING = 240

export function seriesFetchLimit(displayLimit: number): number {
  const want = typeof displayLimit === 'number' && displayLimit > 0 ? Math.floor(displayLimit) : 1
  return Math.min(SERIES_FETCH_CEILING, Math.max(want, want * SERIES_FETCH_MULTIPLIER))
}

/** For surfaces whose LIMIT is a GLOBAL cap on the community's whole upcoming set rather than a
 *  display count (the /events public union, the nearby distance read). SERIES_FETCH_CEILING does not
 *  apply there: rows dropped past this cap are dropped by the DATABASE, before the fold can run. */
export const SERIES_WIDE_READ = 500
