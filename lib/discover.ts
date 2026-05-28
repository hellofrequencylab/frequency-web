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

// ── Shared formatting helpers for the discover UI ─────────────────────────────

export function formatEventDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

export function formatEventDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function hasEventEnded(event: PublicEvent): boolean {
  return new Date(event.ends_at ?? event.starts_at).getTime() < Date.now()
}

export function eventDateBadge(iso: string): { month: string; day: number } {
  const d = new Date(iso)
  return {
    month: d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
    day: d.getDate(),
  }
}
