import type { CircleCardData } from './circle-card'

// Shared circle query + display helpers, used by both /circles (curated default)
// and /circles/browse (full discovery). One select, one context formatter.

export const CIRCLE_SELECT = `id, name, slug, about, type, member_count, member_cap, status, created_at,
  latitude, longitude, neighborhood, topical_channel_id,
  channel:topical_channels!topical_channel_id ( name ),
  hub:hubs!hub_id (
    id, name, slug,
    nexus:nexuses!nexus_id ( id, name, slug, outpost:outposts!outpost_id ( name ) )
  )`

export type CircleRow = {
  id: string
  name: string
  slug: string
  about: string | null
  type: 'in-person' | 'online'
  member_count: number
  member_cap: number
  status: string
  created_at: string
  latitude: number | null
  longitude: number | null
  neighborhood: string | null
  topical_channel_id: string | null
  channel: { name: string } | null
  hub: {
    id: string
    name: string
    slug: string
    nexus: { id: string; name: string; slug: string; outpost: { name: string } | null } | null
  } | null
}

export function contextFor(c: CircleRow): string | null {
  const place = c.hub?.nexus?.outpost?.name ?? c.neighborhood ?? null
  const nexus = c.hub?.nexus?.name ?? null
  const geo = [place, nexus].filter(Boolean).join(' · ')
  if (geo) return geo
  return c.channel?.name ?? null
}

export function toCardData(c: CircleRow): CircleCardData {
  return {
    id: c.id,
    name: c.name,
    slug: c.slug,
    about: c.about,
    type: c.type,
    member_count: c.member_count,
    member_cap: c.member_cap,
    status: c.status,
    context: contextFor(c),
  }
}
