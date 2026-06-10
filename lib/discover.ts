// ── Public "Discover" data layer ──────────────────────────────────────────────
// Every read here goes through the column-safe, location-redacted SECURITY
// DEFINER RPCs added in 20240211000000_public_discover_reads.sql, OR the
// public-read `topical_channels` table (anon SELECT allowed since
// 20240201000000). Nothing in this module ever returns a precise location:
// events expose only the owning circle's city, circles expose only city
// (never neighborhood/latitude/longitude), posts expose only a safe author
// shape. This is the ONLY data source the anon /discover pages use.
//
// The server Supabase client is untyped (lib/supabase/server.ts is not
// parametrised with Database), so .rpc()/.from() return loosely-typed data —
// we cast to the explicit row shapes below.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createPublicClient } from '@/lib/supabase/public'

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

// ── Events ────────────────────────────────────────────────────────────────────

export async function getPublicEvents(limit = 50): Promise<PublicEvent[]> {
  const supabase = createPublicClient()
  const { data } = await supabase.rpc('public_events', { _limit: limit })
  return (data ?? []) as PublicEvent[]
}

export async function getPublicEventBySlug(slug: string): Promise<PublicEvent | null> {
  const supabase = createPublicClient()
  const { data } = await supabase.rpc('public_event_by_slug', { _slug: slug })
  const rows = (data ?? []) as PublicEvent[]
  return rows[0] ?? null
}

// ── Circles ─────────────────────────────────────────────────────────────────

export async function getPublicCircles(limit = 50): Promise<PublicCircle[]> {
  const supabase = createPublicClient()
  const { data } = await supabase.rpc('public_circles', { _limit: limit })
  return (data ?? []) as PublicCircle[]
}

export async function getPublicCircleById(id: string): Promise<PublicCircle | null> {
  const supabase = createPublicClient()
  const { data } = await supabase.rpc('public_circle_by_id', { _id: id })
  const rows = (data ?? []) as PublicCircle[]
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
  const { data } = await supabase.rpc('public_posts', { _limit: limit })
  return (data ?? []) as PublicPost[]
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
  const supabase = createPublicClient() as unknown as SupabaseClient

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
