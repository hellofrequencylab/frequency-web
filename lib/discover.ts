// ── Public "Discover" data layer ──────────────────────────────────────────────
// Every read here goes through the column-safe, location-redacted SECURITY
// DEFINER RPCs added in 20240211000000_public_discover_reads.sql, OR the
// public-read `topical_channels` table (anon SELECT allowed since
// 20240201000000). Nothing in this module ever returns a precise location:
// events expose only the owning circle's city, circles expose only city
// (never neighborhood/latitude/longitude), posts expose only a safe author
// shape. This is the ONLY data source the anon /discover pages use.
//
// The two event RPCs also carry the VISIBILITY gate now, and they carry
// different ones on purpose (ADR-903). Both are SECURITY DEFINER, so RLS on
// `events` never runs inside them and their WHERE clauses are the whole gate:
//   • getPublicEvents  → a LISTING. Upcoming, published, non-removed, non-demo,
//     `visibility = 'public'` only, and never owned by a walled Space. Unlisted
//     is a link, not a listing (ADR-202), so it is absent here by design.
//   • getPublicEventBySlug → a LINK RESOLVER. Same gate except it admits
//     'unlisted' too, because the slug IS the link that makes it readable, and
//     it has no upcoming floor so a finished event's page still renders.
// Before ADR-903 neither gated visibility at all, so both returned circle_only
// and private events to anonymous callers.
//
// The server Supabase client is untyped (lib/supabase/server.ts is not
// parametrised with Database), so .rpc()/.from() return loosely-typed data —
// we cast to the explicit row shapes below.

import { createPublicClient } from '@/lib/supabase/public'
import { collapseSeriesRows, seriesFetchLimit, seriesUpcomingFloor, TEASER_CARDS_PER_SERIES } from '@/lib/events/series'
import { dayInZone, HOME_TZ } from '@/lib/time/zone'

// ── Row shapes (mirror the RPC RETURNS TABLE columns) ─────────────────────────

export type PublicEvent = {
  id: string
  slug: string
  title: string
  description: string | null
  starts_at: string
  ends_at: string | null
  city: string | null
  circle_id: string | null
  circle_name: string | null
  /** Ticket price in cents; null/0 = free (drives the JSON-LD `offers` block). */
  price_cents: number | null
  /** The series columns (LIVE-206, migration 20270345002100). Absent from a database ahead of that
   *  migration, in which case seriesKey() falls back to the row id and the fold is a no-op. */
  parent_event_id?: string | null
  recurrence_type?: string | null
}

export type PublicCircle = {
  id: string
  slug: string
  name: string
  about: string | null
  type: string
  member_count: number
  status: string
  city: string | null
  channel_name: string | null
  channel_slug: string | null
}

export type PublicPost = {
  id: string
  body: string
  created_at: string
  media_urls: string[] | null
  author_display_name: string | null
  author_handle: string | null
  author_avatar_url: string | null
}

export type TopicalChannel = {
  id: string
  name: string
  slug: string
  category: string
  description: string | null
  cover_image: string | null
  display_order: number
  pillar_id?: string | null
}

// A Channel (Domain) — the top taxonomy layer. The four rows (Mind / Body /
// Spirit / Expression) live in the `pillars` table, so they stay editable in
// data rather than hardcoded here.
export type Domain = {
  id: string
  slug: string
  name: string
  description: string | null
  accent: string | null
  cover_image: string | null
  display_order: number
}

// A Channel with its Interests/Topics nested beneath it, each carrying a live
// circle count. This is the shape the Channels browse experience renders.
export type DomainWithTopics = Domain & {
  topics: Array<TopicalChannel & { circleCount: number }>
}

/**
 * A read that FAILED, as distinct from one that found nothing.
 *
 * `supabase.rpc()` and PostgREST both RESOLVE with `{ data: null, error }` on a query-level
 * failure rather than rejecting, so the `const { data } = await …; return data ?? []` shape
 * these readers used turns a database outage into an empty list that every caller treats as
 * measured truth. On a DETAIL route that empty list becomes `notFound()`; on an INDEX route
 * it becomes the founding-state copy ("the calendar is quiet for now"), and since every
 * discover page sets `revalidate = 3600`, ISR then serves that lie to everyone for an hour
 * after the database has recovered.
 *
 * Two different failure shapes, deliberately:
 *   · listRead  — fails SOFT to [] and reports it, because an index page that 500s is worse
 *                 than one missing a section. Callers that care read `ok`.
 *   · detailRead — THROWS, because the alternative is answering Googlebot with a genuine 404
 *                 on a sitemapped URL. A 500 is retried; a 404 is believed and de-indexed.
 *
 * Mirrors `settle()` in lib/page-editor/live-data.ts, which fixed this same bug for the
 * marketing blocks and was never applied here.
 */
export class DiscoverReadError extends Error {
  constructor(source: string, cause?: unknown) {
    super(`discover read failed: ${source}`)
    this.name = 'DiscoverReadError'
    this.cause = cause
  }
}

/** One list read. `ok: false` means the query broke; `[]` with `ok: true` means genuinely empty. */
export type ListRead<T> = { rows: T[]; ok: boolean }

// ── Transient-failure retry (LIVE-039) ────────────────────────────────────────
//
// OBSERVED, not theorised: the preview build of 656dac3 died with `TypeError: fetch failed /
// read ECONNRESET` on ONE slug during the /discover/events/[slug] export, while the production
// build of the same commit succeeded four minutes earlier. Merging deploys to production, so the
// same one-packet blip can kill a production deploy. Nothing retried.
//
// The failure arrives RESOLVED, not thrown: supabase-js catches the fetch rejection inside the
// builder and resolves with a synthetic error object whose message carries the network cause.
// So the retry decision reads the ERROR'S SHAPE, never just the code path:
//   · network-ish (fetch failed / ECONNRESET / ETIMEDOUT / EAI_AGAIN / socket …) → transient,
//     retry with backoff — the next packet usually lands;
//   · a BOUNDED-READ ABORT (TimeoutError / AbortError, LIVE-105) → transient. The build-time
//     fetch bound in lib/supabase/public.ts aborts a read that exceeds 20s and undici reports it
//     as `TimeoutError: The operation was aborted due to timeout` with an EMPTY code — none of
//     the errno tokens below. 🔴 This class was invented AFTER this regex was written, and the
//     gap took down a production deploy on 2026-08-25 (ADR-1133): a burst of slow reads hit the
//     bound, the classifier called each one deterministic, detailRead threw on the FIRST abort
//     with both retry delays unused, and the /discover/events/[slug] prerender failed the build.
//   · a Postgres/PostgREST error (a `code` like PGRST116 or 42501) → deterministic, retrying
//     re-asks a question the database already answered. Never retried.
// Empty data is NEVER retried anywhere: on a detail route an empty result is a believed 404
// (see the header above), and "retry until it exists" would turn 404s into timeouts.
//
// Callers now pass a THUNK so every attempt builds a fresh PostgrestBuilder — re-awaiting one
// builder re-uses its settled promise, which would make a "retry" a no-op that re-reads the
// same failure.
// Abort matching is deliberately NARROW: `TimeoutError` (the bound's own abort — undici names
// it that and says "aborted due to timeout") is transient, but a bare `AbortError`/"aborted"
// is a CALLER-initiated abort, which buildBoundedFetch explicitly does not claim — retrying one
// would spend up to another 20s per attempt on a read someone above us already cancelled.
//   · the REST EDGE'S OWN 503 (LIVE-327, ADR-1328) → transient. When PostgREST does not accept
//     the connection, Supabase's edge (Envoy) answers HTTP 503 with a plain-text body,
//     `upstream connect error or disconnect/reset before headers. reset reason: connection
//     timeout`, and supabase-js resolves it as an error whose `code` and `hint` are empty and
//     whose `message` is that body. 🔴 The third shape this classifier was dead for, found the
//     same way as the first two: by a killed build. Every preview that failed on 2026-09-14
//     died on the FIRST answer with no "retrying" line in its log, because none of the errno
//     tokens is in that sentence. The edge's vocabulary is matched below, and `attempt` also
//     reads the resolved STATUS: a 502/503/504 or a Cloudflare 52x with no PostgREST code is
//     the edge talking, whatever words it chose.
const TRANSIENT_RE = /fetch failed|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|socket|network|UND_ERR|TimeoutError|aborted due to timeout|upstream connect error|reset before headers|connection timeout|no healthy upstream/i

/** HTTP statuses that mean "the edge could not reach PostgREST", never a database answer. */
const TRANSIENT_STATUS = new Set([502, 503, 504, 520, 521, 522, 523, 524])

/**
 * A resolved supabase-js result carries the HTTP `status`. A 5xx from the edge with NO
 * PostgREST code is transport, not an answer, even when the body says something this
 * classifier has never seen. A real PostgREST error keeps its code and is never retried.
 */
export function isTransientDiscoverStatus(status: unknown, err: unknown): boolean {
  if (typeof status !== 'number' || !TRANSIENT_STATUS.has(status)) return false
  const code = err && typeof err === 'object' ? (err as { code?: unknown }).code : undefined
  return !(typeof code === 'string' && code.trim() !== '')
}

export function isTransientDiscoverError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const e = err as { code?: unknown; message?: unknown; details?: unknown; cause?: unknown }
  // A real Postgres/PostgREST code marks a deterministic answer — unless the "code" is itself
  // a network errno (supabase-js copies `cause.code` like ECONNRESET onto the error sometimes).
  //
  // 🔴 AN EMPTY `code` IS NOT A CODE. This guard used to read `typeof e.code === 'string'` alone,
  // and that is how this whole retry sat dead in production from the day it shipped (LIVE-084).
  // When the request never REACHES PostgREST there is no PostgREST code to report, and supabase-js
  // says so by resolving an error whose `code` and `hint` are EMPTY STRINGS, not undefined:
  //
  //     { message: 'TypeError: fetch failed', details: '...read ECONNRESET...', hint: '', code: '' }
  //
  // `typeof '' === 'string'` is true and `TRANSIENT_RE.test('')` is false, so the old guard read
  // "there is a code, therefore the database answered" and returned false on the one shape the
  // retry existed to catch. Measured, not reasoned: the production build of eee84ba called the
  // query exactly ONCE (dpl_2SRX2aYctYBXmZw1TaYyi1xBJtBy, 2026-08-21) and the build log carries no
  // retry line, because none was ever attempted.
  const code = typeof e.code === 'string' ? e.code.trim() : ''
  if (code !== '' && !TRANSIENT_RE.test(code)) return false
  // `details` carries the causal chain on a resolved supabase-js network error ("Caused by: Error:
  // read ECONNRESET"), so it is read alongside `message`. The code guard above is what keeps a real
  // Postgres error out, so widening the TEXT cannot make a deterministic failure retryable.
  const text = [
    e.message,
    e.details,
    e.cause instanceof Error ? e.cause.message : '',
    (e.cause as { code?: string } | undefined)?.code,
  ]
    .filter((v): v is string => typeof v === 'string')
    .join(' ')
  return TRANSIENT_RE.test(text)
}

// Three delays, not two (LIVE-327): 750 ms outlasts a dropped packet and not a busy edge. A
// build that waits 4.25 s on one read still finishes; a build that ships a hole does not.
const RETRY_DELAYS_MS = [250, 1000, 3000]

/** What one supabase-js read resolves to: the builder's own `{ data, error, status }`. Exported so
 *  a reader outside this module can hand `listReadFailClosed` a thunk that builds its query. */
export type QueryResult = { data: unknown; error: unknown; status?: number }

async function attempt(
  source: string,
  query: () => PromiseLike<QueryResult>,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<QueryResult> {
  let last: QueryResult = { data: null, error: null }
  for (let i = 0; i <= RETRY_DELAYS_MS.length; i++) {
    try {
      last = await query()
    } catch (cause) {
      // Belt over the resolved-error braces: if a future supabase-js throws instead, treat a
      // thrown network failure exactly like a resolved one.
      last = { data: null, error: cause }
    }
    if (!last.error) return last
    const transient = isTransientDiscoverError(last.error) || isTransientDiscoverStatus(last.status, last.error)
    if (i === RETRY_DELAYS_MS.length || !transient) return last
    console.error(`[discover] ${source} transient failure, retrying in ${RETRY_DELAYS_MS[i]}ms`, last.error)
    await sleep(RETRY_DELAYS_MS[i])
  }
  return last
}

/** Exported for the unit test only — proves the retry FIRES and proves it refuses to. */
export const __retryForTest = { attempt, RETRY_DELAYS_MS }

async function listRead<T>(
  source: string,
  query: () => PromiseLike<QueryResult>,
): Promise<ListRead<T>> {
  const { data, error } = await attempt(source, query)
  if (error) {
    console.error(`[discover] ${source} failed`, error)
    return { rows: [], ok: false }
  }
  return { rows: (data ?? []) as T[], ok: true }
}

async function detailRead<T>(
  source: string,
  query: () => PromiseLike<QueryResult>,
): Promise<T[]> {
  const { data, error } = await attempt(source, query)
  if (error) throw new DiscoverReadError(source, error)
  return (data ?? []) as T[]
}

// ── The section readers' read (LIVE-331) ─────────────────────────────────────
//
// app/sitemap.ts sorts a THROWN failure into two classes (LIVE-329): transport rethrows so a
// regeneration inside a database window fails and the last good copy keeps serving; a database
// answer logs and empties that section. Measured while building it: none of its catches could
// fire, because every section reader (partners, practices, networked Spaces, the four commerce
// verticals, density, the event hubs) resolved a supabase-js transport error into `[]` INSIDE
// itself, with `const { data } = await query` or a bare `catch { return [] }`. The hole formed
// one level below the sitemap's sight, and the same readers feed the /discover pages, whose ISR
// copies cached the same hollow list for an hour.
//
// `listReadFailClosed` is the one read those readers make now. It is `listRead` with the verdict
// turned into a SHAPE the caller cannot ignore:
//   · a healthy read resolves the rows (`[]` when there are genuinely none);
//   · a DETERMINISTIC failure (a real PostgREST/Postgres code, a thrown bug) logs one line naming
//     the source and resolves `[]`, exactly as before, so no page goes down on a database answer;
//   · a TRANSPORT failure (the classifier above: fetch failed / ECONNRESET / the REST edge's own
//     5xx with no PostgREST code) is retried through the same ladder as every other discover read
//     and, if it outlasts the ladder, THROWS `TransientReadError` with the supabase error on
//     `cause` and the HTTP status on `status`, so app/sitemap.ts's cause-walk reads it as
//     transport and abandons the regeneration, and an ISR discover page keeps its last good copy.
// A caller that wants `[]` for its empty state still gets `[]` for an EMPTY result; what it can
// no longer get is `[]` for a FAILED one.
export class TransientReadError extends Error {
  /** The HTTP status the edge answered with, when the verdict came from the status alone. */
  readonly status: number | undefined
  constructor(source: string, cause: unknown, status?: number) {
    super(`read failed on transport: ${source}`)
    this.name = 'TransientReadError'
    this.cause = cause
    this.status = status
  }
}

export async function listReadFailClosed<T>(
  source: string,
  query: () => PromiseLike<QueryResult>,
): Promise<T[]> {
  const { data, error, status } = await attempt(source, query)
  if (!error) return (data ?? []) as T[]
  if (isTransientDiscoverError(error) || isTransientDiscoverStatus(status, error)) {
    throw new TransientReadError(source, error, typeof status === 'number' ? status : undefined)
  }
  console.error(`[discover] ${source} failed`, error)
  return []
}

/** The classifier walked down the `cause` chain, so a `TransientReadError` (or any wrapper that
 *  keeps the supabase error on `cause`) reads as transport when the wrapped error does. */
export function isTransientReadFailure(err: unknown): boolean {
  let cur: unknown = err
  for (let depth = 0; cur && typeof cur === 'object' && depth < 5; depth++) {
    const e = cur as { status?: unknown; cause?: unknown }
    if (isTransientDiscoverError(cur) || isTransientDiscoverStatus(e.status, cur)) return true
    cur = e.cause
  }
  return false
}

/** A `.catch` handler for an index page that used to write `.catch(() => [])` around one of the
 *  section readers. The reader already resolves `[]` on a database answer, so what still reaches
 *  this handler is a transport failure that outlasted the ladder, or a thrown bug. The first is
 *  rethrown so the page fails closed (an ISR page whose regeneration throws keeps its last good
 *  copy rather than caching a hollow one, LIVE-329); the second logs and empties, as before. */
export function emptyUnlessTransient(source: string): (err: unknown) => never[] {
  // `never[]` so `.catch()` narrows to the reader's own row type without a type argument.
  return (err) => {
    if (isTransientReadFailure(err)) throw err
    console.error(`[discover] ${source} failed`, err)
    return []
  }
}

// ── Events ────────────────────────────────────────────────────────────────────

/** Upcoming public events, ONE per series (LIVE-206). The RPC returns every date; a weekly class
 *  with nine dates ahead is one gathering on a discovery page, and `events.length` on the discover
 *  index pages and the per-city buckets is a count of gatherings for the same reason every other
 *  count site folds (LIVE-198). Over-fetches because the fold spends the limit on rows it discards,
 *  and the RPC caps its own read at 200. */
export async function getPublicEvents(limit = 50): Promise<PublicEvent[]> {
  const supabase = createPublicClient()
  const { rows } = await listRead<PublicEvent>('public_events', () =>
    supabase.rpc('public_events', { _limit: seriesFetchLimit(limit) }),
  )
  const floor = seriesUpcomingFloor(dayInZone(new Date(), HOME_TZ))
  return collapseSeriesRows(rows, { upcomingFrom: floor, perSeries: TEASER_CARDS_PER_SERIES }).slice(0, limit)
}

export async function getPublicEventBySlug(slug: string): Promise<PublicEvent | null> {
  const supabase = createPublicClient()
  const rows = await detailRead<PublicEvent>(
    'public_event_by_slug',
    () => supabase.rpc('public_event_by_slug', { _slug: slug }),
  )
  return rows[0] ?? null
}

// ── Circles ─────────────────────────────────────────────────────────────────

export async function getPublicCircles(limit = 50): Promise<PublicCircle[]> {
  const supabase = createPublicClient()
  const { rows } = await listRead<PublicCircle>('public_circles', () => supabase.rpc('public_circles', { _limit: limit }))
  return rows
}

export async function getPublicCircleById(id: string): Promise<PublicCircle | null> {
  const supabase = createPublicClient()
  const rows = await detailRead<PublicCircle>(
    'public_circle_by_id',
    () => supabase.rpc('public_circle_by_id', { _id: id }),
  )
  return rows[0] ?? null
}

/** A uuid, as the public detail routes receive it in a path segment. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * One PUBLIC circle by SLUG (the canonical public key) or by uuid (the legacy URL form).
 *
 * LIVE-182: /discover/circles/<uuid> was the canonical URL although circles.slug is NOT NULL and
 * `public_circle_by_id` has returned it all along — the page read the slug and threw it away. This
 * is the same slugOrId resolution `getPublicPractice` has used since LIVE-052, so a printed QR code
 * or a pasted uuid still resolves while the slug is the URL that gets advertised and indexed.
 *
 * Both branches are the SAME redaction: `public_circle_by_slug` copies its twin's visibility
 * predicate verbatim, so arriving by slug can never reveal a circle arriving by id would not.
 */
export async function getPublicCircle(slugOrId: string): Promise<PublicCircle | null> {
  if (UUID.test(slugOrId)) return getPublicCircleById(slugOrId)
  const supabase = createPublicClient()
  const rows = await detailRead<PublicCircle>(
    'public_circle_by_slug',
    () => supabase.rpc('public_circle_by_slug', { _slug: slugOrId }),
  )
  return rows[0] ?? null
}

/**
 * Circles that belong to a given topical channel. The public_circles RPC
 * doesn't filter by channel, so we fetch the top circles and narrow in JS.
 * Fine at current scale (RPC caps at 200, ordered by member_count).
 */
export async function getPublicCirclesByChannel(
  channelSlug: string,
  limit = 200,
): Promise<PublicCircle[]> {
  const circles = await getPublicCircles(limit)
  return circles.filter((c) => c.channel_slug === channelSlug)
}

// ── Posts ─────────────────────────────────────────────────────────────────────

export async function getPublicPosts(limit = 20): Promise<PublicPost[]> {
  const supabase = createPublicClient()
  const { rows } = await listRead<PublicPost>('public_posts', () => supabase.rpc('public_posts', { _limit: limit }))
  return rows
}

// ── Topical channels (public-read table) ──────────────────────────────────────

export async function getTopicalChannels(): Promise<TopicalChannel[]> {
  const supabase = createPublicClient()
  const { data } = await supabase
    .from('topical_channels')
    .select('id, name, slug, category, description, cover_image, display_order')
    .eq('is_active', true)
    .order('display_order', { ascending: true })
  return (data ?? []) as TopicalChannel[]
}

export async function getTopicalChannelBySlug(slug: string): Promise<TopicalChannel | null> {
  const supabase = createPublicClient()
  const { data } = await supabase
    .from('topical_channels')
    .select('id, name, slug, category, description, cover_image, display_order')
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle()
  return (data as TopicalChannel | null) ?? null
}

// ── Channels (the 4 Domains) with their Interests/Topics ──────────────────────
// The top browse layer: the four Channels (Mind / Body / Spirit / Expression)
// from the public-read `pillars` table, each with its active topical_channels
// (Interests) ordered, and a live circle count per Interest.
//
// Circle counts reuse the public_circles RPC + channel_slug grouping (same
// approach the discover topics page and the in-app browse already use), so we
// never expose anything the anon layer can't already see.

export async function getChannelsWithTopics(): Promise<DomainWithTopics[]> {
  const supabase = createPublicClient()

  const [domainsRes, topicsRes, circles] = await Promise.all([
    supabase
      .from('pillars')
      .select('id, slug, name, description, accent, cover_image, display_order')
      .eq('is_active', true)
      .order('display_order', { ascending: true }),
    supabase
      .from('topical_channels')
      .select('id, name, slug, category, description, cover_image, display_order, pillar_id')
      .eq('is_active', true)
      .order('display_order', { ascending: true }),
    getPublicCircles(200),
  ])

  const domains = (domainsRes.data ?? []) as Domain[]
  const topics = (topicsRes.data ?? []) as TopicalChannel[]

  // Circle count per topic, keyed by slug (mirrors the discover topics page).
  const countBySlug = new Map<string, number>()
  for (const c of circles) {
    if (c.channel_slug) countBySlug.set(c.channel_slug, (countBySlug.get(c.channel_slug) ?? 0) + 1)
  }

  return domains.map((d) => ({
    ...d,
    topics: topics
      .filter((t) => t.pillar_id === d.id)
      .map((t) => ({ ...t, circleCount: countBySlug.get(t.slug) ?? 0 })),
  }))
}

// ── Counts (existing RPCs from 20240204000000) ────────────────────────────────

export async function getPublicCounts(): Promise<{ members: number; circles: number }> {
  const supabase = createPublicClient()
  const [m, c] = await Promise.all([
    supabase.rpc('public_member_count'),
    supabase.rpc('public_active_circle_count'),
  ])
  return {
    members: (m.data as number | null) ?? 0,
    circles: (c.data as number | null) ?? 0,
  }
}

// ── City clusters for the public locator map ──────────────────────────────────
// PRIVACY: public circles/events expose `city` ONLY — never lat/lng/neighborhood
// (enforced in 20240211000000_public_discover_reads.sql). So the locator map can
// never plot a real circle/venue. Instead we aggregate by city and map each
// recognized city name to a server-curated APPROXIMATE centroid below. No
// per-circle coordinate ever reaches the client — only these city points.

export type CityCluster = {
  city: string
  circles: number
  events: number
  lat: number
  lng: number
}

// Approximate city centroids [lat, lng] for the founding metro (San Diego /
// North County). Cities not listed here are still counted but not plotted.
const CITY_CENTROIDS: Record<string, [number, number]> = {
  'Encinitas': [33.0370, -117.2920],
  'Carlsbad': [33.1581, -117.3506],
  'Oceanside': [33.1959, -117.3795],
  'Vista': [33.2000, -117.2425],
  'San Marcos': [33.1434, -117.1661],
  'Escondido': [33.1192, -117.0864],
  'Solana Beach': [32.9912, -117.2712],
  'Del Mar': [32.9595, -117.2653],
  'Cardiff': [33.0203, -117.2786],
  'Cardiff-by-the-Sea': [33.0203, -117.2786],
  'Leucadia': [33.0686, -117.2986],
  'Rancho Santa Fe': [33.0214, -117.2025],
  'Carmel Valley': [32.9462, -117.2235],
  'Fallbrook': [33.3764, -117.2511],
  'Poway': [32.9628, -117.0359],
  'La Jolla': [32.8328, -117.2713],
  'San Diego': [32.7157, -117.1611],
}

export async function getPublicCityClusters(): Promise<CityCluster[]> {
  const [circles, events] = await Promise.all([getPublicCircles(200), getPublicEvents(100)])
  const byCity = new Map<string, { circles: number; events: number }>()
  for (const c of circles) {
    if (!c.city) continue
    const e = byCity.get(c.city) ?? { circles: 0, events: 0 }
    e.circles += 1
    byCity.set(c.city, e)
  }
  for (const ev of events) {
    if (!ev.city) continue
    const e = byCity.get(ev.city) ?? { circles: 0, events: 0 }
    e.events += 1
    byCity.set(ev.city, e)
  }

  const clusters: CityCluster[] = []
  for (const [city, agg] of byCity) {
    const key = Object.keys(CITY_CENTROIDS).find((k) => k.toLowerCase() === city.toLowerCase())
    if (!key) continue // unrecognized city — counted in aggregates elsewhere, just not plotted
    const [lat, lng] = CITY_CENTROIDS[key]
    clusters.push({ city, circles: agg.circles, events: agg.events, lat, lng })
  }
  return clusters.sort((a, b) => b.circles - a.circles)
}

// ── Shared formatting helpers for the discover UI ─────────────────────────────
// The pure date formatters now live in lib/utils (shared with the feed cards +
// marketing event row); re-exported here so discover consumers keep one import.
export { formatEventDate, formatEventDateTime, eventDateBadge } from '@/lib/utils'

export function hasEventEnded(event: PublicEvent): boolean {
  return new Date(event.ends_at ?? event.starts_at).getTime() < Date.now()
}
