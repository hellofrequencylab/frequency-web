// ── Public events discovery — enrichment + hub data layer ─────────────────────
// Owned by the public events SEO surface. Everything here keeps the SAME privacy
// contract as lib/discover and the public_* RPCs: events expose CITY-LEVEL
// location ONLY (city / region / country), never the venue, street, geog point,
// or the members-only online join URL. ADR-186.
//
// WHY a direct table read (not the public_events RPC): the redaction RPCs added
// in 20240211000000 / 20260612020000 don't project the newer B1 columns
// (attendance_mode, category, is_cancelled, region, country) that the enriched
// schema.org Event and the city × category hubs need. The events SELECT RLS
// (20260612000000 / 20260625010000_standalone_public_events) already restricts
// the anon role to public/unlisted rows, so a cast read that selects ONLY the
// privacy-safe columns is sanctioned. We never SELECT location / street /
// venue_name / geog / online_url here.
//
// That public/unlisted RLS gate is now exactly the gate public_event_by_slug
// carries too (ADR-903), so the enrichment and the RPC row it upgrades resolve
// the same set of events. Before ADR-903 the RPC was the LOOSER of the two: it
// gated no visibility at all, so a circle_only event returned RPC fields here
// with null enrichment.
//
// New columns (attendance_mode / region / country / status) are untyped against
// lib/database.types (we don't regenerate types). Per the repo convention + the
// ADR-246 lint rule, we keep the TYPED public client and cast only the returned
// payload to the explicit row shape — never the client itself.

import { createPublicClient } from '@/lib/supabase/public'
import type { PublicEvent } from '@/lib/discover'
import { HOME_TZ, dayInZone } from '@/lib/time/zone'
import {
  DEFAULT_CARDS_PER_SERIES,
  SERIES_COLUMNS,
  SERIES_WIDE_READ,
  collapseSeriesRows,
  seriesUpcomingFloor,
  type SeriesFields,
} from '@/lib/events/series'

// Privacy-safe enrichment fields layered onto a PublicEvent for the schema.org
// Event and the OG image. attendance_mode + is_cancelled drive eventAttendanceMode
// + eventStatus; region/country round out the city-level Place.
// The ONE ticket pricing authority, reused so this surface and the canonical /events/<slug> page
// can never publish two different prices for the same event.
import { ticketFromPriceCents, ticketsSoldOut } from '@/lib/commerce/ticket-projection'

export type EventEnrichment = {
  attendance_mode: 'in_person' | 'online' | 'hybrid'
  is_cancelled: boolean
  category: string
  region: string | null
  country: string | null
  /** `events.currency` as stored (lower-case 'usd' by default). Carried so the Offer is
   *  denominated in the event's own currency instead of a hardcoded USD. */
  currency: string | null
  /** Cheapest active ticket tier in cents, or null when the event is tiered and free. ABSENT
   *  (undefined) when the event has no tiers, which is what keeps eventSchema falling back to
   *  events.price_cents. See the three-state note in lib/jsonld.ts. */
  ticket_from_cents?: number | null
  /** Every active tier exhausted. ABSENT when the event has no tiers — this surface reads anon and
   *  cannot see `event_rsvps`, so RSVP-capacity sold-out is knowable only on the canonical
   *  /events/<slug> page, which supplies it there. Absent is the honest answer, not `false`. */
  is_sold_out?: boolean
  /** The event's cover as a PUBLIC URL, or null (LIVE-133).
   *
   *  The public event page composed the same EventDetailTemplate as the in-app one and passed no
   *  `cover` at all, so the crawlable half of every event opened on a back link and an H1 while
   *  the in-app half led with the artwork.
   *
   *  🔴 WHY IT COMES FROM HERE AND NOT FROM lib/discover.ts. The row that filed this assumed the
   *  fix was "the same event-media getPublicUrl the in-app page already does" — but the in-app
   *  page uses the ADMIN client, and `public_event_by_slug` (the anon RPC behind
   *  getPublicEventBySlug) returns no cover column at all. Adding one there means a DROP + CREATE
   *  on a SECURITY DEFINER function granted to `anon` — the same function that, before ADR-903,
   *  served private events to anonymous callers. That is not a cover change.
   *
   *  This module already reads `events` directly with the ANON client, so RLS is the gate and the
   *  cover rides along on a select this page was making anyway — no migration, no new surface, and
   *  no widening of what anon may see: a row this read cannot see returns nothing here either.
   *  `getPublicUrl` builds a string and needs no privileges. */
  cover_url?: string | null
  /** The operator's focal point ("x% y%") from events.theme, so the public crop matches the
   *  in-app one instead of defaulting to centre. */
  cover_focus?: string | null
}

export type EnrichedPublicEvent = PublicEvent & EventEnrichment

// A row from the privacy-safe direct read. NOTE: deliberately omits
// location / street / venue_name / geog / online_url.
type SafeEventRow = {
  id: string
  slug: string
  title: string
  description: string | null
  starts_at: string
  ends_at: string | null
  city: string | null
  region: string | null
  country: string | null
  attendance_mode: string | null
  is_cancelled: boolean | null
  category: string | null
  price_cents: number | null
  currency: string | null
}

const SAFE_COLUMNS =
  `id, slug, title, description, starts_at, ends_at, city, region, country, attendance_mode, is_cancelled, category, price_cents, currency, ${SERIES_COLUMNS}`

function normalizeMode(mode: string | null): EventEnrichment['attendance_mode'] {
  return mode === 'online' || mode === 'hybrid' ? mode : 'in_person'
}

function toEnriched(r: SafeEventRow): EnrichedPublicEvent {
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    description: r.description,
    starts_at: r.starts_at,
    ends_at: r.ends_at,
    city: r.city,
    // The hub list doesn't render the hosting circle, so the circle fields stay
    // null here (the detail page enriches the RPC row, which carries the circle).
    circle_id: null,
    circle_name: null,
    price_cents: r.price_cents,
    attendance_mode: normalizeMode(r.attendance_mode),
    is_cancelled: r.is_cancelled ?? false,
    category: r.category ?? 'gathering',
    region: r.region,
    country: r.country,
    currency: r.currency,
  }
}

// Read the privacy-safe enrichment for a single event by slug. Returns null when
// the slug isn't a readable public/unlisted event. Used to upgrade the RPC-backed
// PublicEvent on the detail page to an EnrichedPublicEvent for the JSON-LD.
export async function getEventEnrichment(slug: string): Promise<EventEnrichment | null> {
  const supabase = createPublicClient()
  const { data } = await supabase
    .from('events')
    .select('id, attendance_mode, is_cancelled, category, region, country, currency, cover_image_path, theme')
    .eq('slug', slug)
    .limit(1)
    .maybeSingle()
  if (!data) return null
  const r = data as unknown as Pick<
    SafeEventRow,
    'attendance_mode' | 'is_cancelled' | 'category' | 'region' | 'country' | 'currency'
  > & { id: string; cover_image_path: string | null; theme: unknown }

  // The cover, as a public URL. `getPublicUrl` is pure string construction — no request, no
  // privileges — so it is safe on the anon client. A null path yields null, not a broken <img>.
  const coverUrl = r.cover_image_path
    ? (supabase.storage.from('event-media').getPublicUrl(r.cover_image_path).data?.publicUrl ?? null)
    : null
  // events.theme is a free-form jsonb bag; read the one key we want and ignore the rest.
  const coverFocus =
    r.theme && typeof r.theme === 'object' && typeof (r.theme as Record<string, unknown>).coverFocus === 'string'
      ? ((r.theme as Record<string, string>).coverFocus)
      : null

  // A ticketed event prices on its ACTIVE TIERS, not events.price_cents (null for them), so the
  // schema.org Offer published "free" for every tier-priced event. The tier read is anon-safe:
  // event_ticket_types' SELECT policy scopes rows to events the caller can already see, and this
  // returns only an aggregate price. FAIL-SOFT — no tiers (or an unreadable read) simply omits the
  // field, which restores the events.price_cents fallback rather than asserting a wrong price.
  // `quantity`/`sold` ride along on the SAME read that prices the tiers, so knowing whether the
  // event is still buyable costs no extra round trip on a route we want statically rendered.
  const { data: tierRows } = await supabase
    .from('event_ticket_types')
    .select('pricing_mode, price_cents, min_cents, suggested_cents, quantity, sold')
    .eq('event_id', r.id)
    .eq('active', true)
  const tiers = (tierRows ?? []) as unknown as (Parameters<typeof ticketFromPriceCents>[0][number] &
    Parameters<typeof ticketsSoldOut>[0][number])[]

  return {
    attendance_mode: normalizeMode(r.attendance_mode),
    is_cancelled: r.is_cancelled ?? false,
    category: r.category ?? 'gathering',
    region: r.region,
    country: r.country,
    currency: r.currency,
    cover_url: coverUrl,
    cover_focus: coverFocus,
    ...(tiers.length > 0
      ? { ticket_from_cents: ticketFromPriceCents(tiers), is_sold_out: ticketsSoldOut(tiers) }
      : {}),
  }
}

// ── City × category hubs ──────────────────────────────────────────────────────
// Indexable hubs whose value is unique DATA, not boilerplate (EVENTS-REWORK SEO).
// The catalog below maps hub slugs onto the REAL event vocabulary — the ten
// CATEGORY_OPTIONS values in lib/events/options.ts, the one source — plus a
// member-facing label and the plain nouns the hub copy composes with. Slugs are
// lowercase + hyphenated so a URL stays clean and stable.
//
// NOTE: events.category is NOT backed by a DB CHECK constraint (verified against
// prod, 2026-07-28 — the column is plain `text default 'gathering'`). The
// server-side validation against CATEGORY_VALUES is the only gate, so an
// off-list value CAN exist in a row. categoryForValue() below drops any value
// without a hub, which correctly keeps junk out of the index — but it equally
// hides a REAL category this catalog forgot, which is exactly how six of the ten
// went missing from the hub index and app/sitemap.ts before 2026-07-28.
// scripts/check-vocab.mjs (CI, `pnpm check:vocab`) now asserts this catalog and
// lib/events/options.ts agree in BOTH directions, so that drift fails the build.

export type EventCategory = {
  /** URL slug, e.g. "movement". */
  slug: string
  /** The events.category value(s) this hub collects. */
  values: string[]
  /** Member-facing plural label, e.g. "Movement". */
  label: string
  /** A plain, voice-compliant plural noun for copy, e.g. "movement sessions". */
  noun: string
  /** The singular of `noun` (kept explicit so we never mangle "ceremonies"). */
  nounSingular: string
}

// One hub per real category — every `values` key is a live CATEGORY_OPTIONS
// value, and every CATEGORY_OPTIONS value has a hub (check:vocab holds both
// directions). Labels + nouns pass CONTENT-VOICE (plain, no hype, no em dashes);
// names stay NAMING-compliant (Circle keeps its capital, "Event" stays generic).
export const EVENT_CATEGORIES: EventCategory[] = [
  { slug: 'gatherings', values: ['gathering'], label: 'Gatherings', noun: 'gatherings', nounSingular: 'gathering' },
  { slug: 'movement', values: ['movement'], label: 'Movement', noun: 'movement sessions', nounSingular: 'movement session' },
  { slug: 'ceremony', values: ['ceremony'], label: 'Ceremony', noun: 'ceremonies', nounSingular: 'ceremony' },
  { slug: 'circle-rituals', values: ['circle_ritual'], label: 'Circle Rituals', noun: 'Circle rituals', nounSingular: 'Circle ritual' },
  { slug: 'learning', values: ['learning'], label: 'Learning', noun: 'learning sessions', nounSingular: 'learning session' },
  { slug: 'social', values: ['social'], label: 'Social', noun: 'social gatherings', nounSingular: 'social gathering' },
  { slug: 'service', values: ['service'], label: 'Service', noun: 'service projects', nounSingular: 'service project' },
  { slug: 'meetups', values: ['external_meetup'], label: 'Meetups', noun: 'meetups', nounSingular: 'meetup' },
  { slug: 'retreats', values: ['retreat'], label: 'Retreats', noun: 'retreats', nounSingular: 'retreat' },
  { slug: 'online', values: ['online'], label: 'Online', noun: 'online gatherings', nounSingular: 'online gathering' },
]

export function getCategoryBySlug(slug: string): EventCategory | undefined {
  return EVENT_CATEGORIES.find((c) => c.slug === slug)
}

// A city slug is the city name lowercased with spaces → hyphens. Round-trips
// through the event's own `city` text (which is what we display anyway).
export function citySlug(city: string): string {
  return city.trim().toLowerCase().replace(/\s+/g, '-')
}

export function cityFromSlug(slug: string): string {
  // Title-case each hyphen-separated token; good enough for display + matching.
  return slug
    .split('-')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ')
}

// Pull every readable upcoming public event with the privacy-safe columns. Used
// to build the hubs and their static params. RLS limits anon to public/unlisted;
// we additionally filter to published, non-cancelled, upcoming, public.
async function getUpcomingSafeEvents(
  limit = SERIES_WIDE_READ,
  perSeries = DEFAULT_CARDS_PER_SERIES,
): Promise<EnrichedPublicEvent[]> {
  const supabase = createPublicClient()
  // Wall-clock floor in the community's zone: starts_at is the host's local time kept as UTC parts,
  // so a raw instant hides tonight's gathering from every hub after 5pm Pacific. One value for the
  // query and the fold.
  const floor = seriesUpcomingFloor(dayInZone(new Date(), HOME_TZ))
  const { data } = await supabase
    .from('events')
    .select(SAFE_COLUMNS)
    .eq('visibility', 'public')
    .eq('status', 'published')
    .eq('is_cancelled', false)
    .gte('starts_at', floor)
    .order('starts_at', { ascending: true })
    // NOT seriesFetchLimit: this cap is GLOBAL (the community's whole upcoming public set), not a
    // display count, so rows past it are dropped by the database before any fold can run. The number
    // is unchanged; SERIES_WIDE_READ just says what it is.
    .limit(limit)
  const rows = (data ?? []) as unknown as (SafeEventRow & SeriesFields)[]
  // FOLD BEFORE toEnriched. EnrichedPublicEvent does not carry the recurrence columns, so a fold
  // after the map is a silent no-op. One weekly series used to publish ~9 near-identical hub cards
  // and ~9 schema.org Event nodes; now it publishes its next `perSeries` dates.
  return collapseSeriesRows(rows, { upcomingFrom: floor, perSeries }).map(toEnriched)
}

// The set of (city, category) pairs that actually have ≥1 upcoming public event,
// with their event lists. This is what makes a hub indexable: a live list of real
// events, never an empty boilerplate facet (low-value facets are kept out of
// crawl — see app/sitemap.ts + app/robots.ts).
export type CityCategoryHub = {
  city: string
  citySlug: string
  category: EventCategory
  events: EnrichedPublicEvent[]
}

// LOUD DROP-THROUGH WARNING: an event whose stored category matches no hub row is
// EXCLUDED from the hub index and therefore from app/sitemap.ts, with no error and
// no log. That is the right call for junk (events.category has no DB CHECK, so an
// off-list value can exist) — and exactly why the catalog above must cover every
// real vocabulary value. check:vocab fails CI if it stops doing so.
function categoryForValue(value: string): EventCategory | undefined {
  return EVENT_CATEGORIES.find((c) => c.values.includes(value))
}

export async function getCityCategoryHubs(): Promise<CityCategoryHub[]> {
  const events = await getUpcomingSafeEvents()
  const byKey = new Map<string, CityCategoryHub>()

  for (const e of events) {
    if (!e.city) continue // city-less events can't anchor a city hub
    const category = categoryForValue(e.category)
    if (!category) continue // category without a hub stays out of the index
    const cSlug = citySlug(e.city)
    const key = `${cSlug}::${category.slug}`
    const hub =
      byKey.get(key) ??
      ({ city: e.city, citySlug: cSlug, category, events: [] } satisfies CityCategoryHub)
    hub.events.push(e)
    byKey.set(key, hub)
  }

  return [...byKey.values()]
}

// One hub by its URL params. Returns null when the pair has no live events so the
// route can 404 rather than render an empty, low-value facet page.
export async function getCityCategoryHub(
  city: string,
  category: string,
): Promise<CityCategoryHub | null> {
  const cat = getCategoryBySlug(category)
  if (!cat) return null
  const wantCity = citySlug(city)
  const hubs = await getCityCategoryHubs()
  return hubs.find((h) => h.citySlug === wantCity && h.category.slug === cat.slug) ?? null
}
