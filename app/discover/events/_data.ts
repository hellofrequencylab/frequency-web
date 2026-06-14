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
// privacy-safe columns is sanctioned and leaks nothing the RPC wouldn't. We never
// SELECT location / street / venue_name / geog / online_url here.
//
// New columns (attendance_mode / region / country / status) are untyped against
// lib/database.types (we don't regenerate types). Per the repo convention + the
// ADR-246 lint rule, we keep the TYPED public client and cast only the returned
// payload to the explicit row shape — never the client itself.

import { createPublicClient } from '@/lib/supabase/public'
import type { PublicEvent } from '@/lib/discover'

// Privacy-safe enrichment fields layered onto a PublicEvent for the schema.org
// Event and the OG image. attendance_mode + is_cancelled drive eventAttendanceMode
// + eventStatus; region/country round out the city-level Place.
export type EventEnrichment = {
  attendance_mode: 'in_person' | 'online' | 'hybrid'
  is_cancelled: boolean
  category: string
  region: string | null
  country: string | null
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
}

const SAFE_COLUMNS =
  'id, slug, title, description, starts_at, ends_at, city, region, country, attendance_mode, is_cancelled, category, price_cents'

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
  }
}

// Read the privacy-safe enrichment for a single event by slug. Returns null when
// the slug isn't a readable public/unlisted event. Used to upgrade the RPC-backed
// PublicEvent on the detail page to an EnrichedPublicEvent for the JSON-LD.
export async function getEventEnrichment(slug: string): Promise<EventEnrichment | null> {
  const supabase = createPublicClient()
  const { data } = await supabase
    .from('events')
    .select('attendance_mode, is_cancelled, category, region, country')
    .eq('slug', slug)
    .limit(1)
    .maybeSingle()
  if (!data) return null
  const r = data as unknown as Pick<
    SafeEventRow,
    'attendance_mode' | 'is_cancelled' | 'category' | 'region' | 'country'
  >
  return {
    attendance_mode: normalizeMode(r.attendance_mode),
    is_cancelled: r.is_cancelled ?? false,
    category: r.category ?? 'gathering',
    region: r.region,
    country: r.country,
  }
}

// ── City × category hubs ──────────────────────────────────────────────────────
// Indexable hubs whose value is unique DATA, not boilerplate (EVENTS-REWORK SEO).
// The category catalog is the locked taxonomy from
// 20260609230000_events_p0_capacity_visibility (events.category) plus a member-
// facing label + a short, plain hub intro. Slugs are lowercase + hyphenated so a
// URL stays clean and stable. Categories not listed here are not given a hub.

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

// One hub per durable category. Labels + nouns pass CONTENT-VOICE (plain, no
// hype, no em dashes); names stay NAMING-compliant ("Event" stays generic).
export const EVENT_CATEGORIES: EventCategory[] = [
  { slug: 'gatherings', values: ['gathering'], label: 'Gatherings', noun: 'gatherings', nounSingular: 'gathering' },
  { slug: 'movement', values: ['movement', 'fitness'], label: 'Movement', noun: 'movement sessions', nounSingular: 'movement session' },
  { slug: 'workshops', values: ['workshop', 'class'], label: 'Workshops', noun: 'workshops and classes', nounSingular: 'workshop' },
  { slug: 'ceremony', values: ['ceremony', 'ritual'], label: 'Ceremony', noun: 'ceremonies', nounSingular: 'ceremony' },
  { slug: 'social', values: ['social', 'meal'], label: 'Social', noun: 'social gatherings', nounSingular: 'social gathering' },
  { slug: 'outdoors', values: ['outdoors', 'adventure'], label: 'Outdoors', noun: 'outdoor gatherings', nounSingular: 'outdoor gathering' },
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
async function getUpcomingSafeEvents(limit = 500): Promise<EnrichedPublicEvent[]> {
  const supabase = createPublicClient()
  const { data } = await supabase
    .from('events')
    .select(SAFE_COLUMNS)
    .eq('visibility', 'public')
    .eq('status', 'published')
    .eq('is_cancelled', false)
    .gte('starts_at', new Date().toISOString())
    .order('starts_at', { ascending: true })
    .limit(limit)
  const rows = (data ?? []) as unknown as SafeEventRow[]
  return rows.map(toEnriched)
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
