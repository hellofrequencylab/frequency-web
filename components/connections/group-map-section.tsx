import dynamic from 'next/dynamic'
import { createAdminClient } from '@/lib/supabase/admin'
import { getConnectionSettings } from '@/lib/connections/connection-settings'
import { ModuleCard } from '@/components/modules/module-card'
import type { GroupMapEvent, GroupMapVenue } from './group-map'

// maplibre must not run on the server — load the map client-side only (matches
// circles-map.tsx). The wrapper itself is an async RSC.
const GroupMap = dynamic(() => import('./group-map'), {
  ssr: false,
  loading: () => (
    <div className="h-[320px] w-full animate-pulse rounded-2xl border border-border bg-surface-elevated" />
  ),
})

export type GroupMapCircle = {
  id: string
  name: string
  latitude: number | null
  longitude: number | null
  neighborhood: string | null
  city: string | null
}

// Events carry only a `location` text today (no lat/lng on the events table), so
// `latitude`/`longitude` are null here and such events simply aren't pinned — per
// ADR-186 we never invent coordinates. The shape is future-proofed for when
// events gain public venue coordinates.
type EventRow = {
  id: string
  title: string
  starts_at: string
}

function formatEventDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

// Server wrapper for the circle venue map (ADR-186, Connection Layer P4):
// "a live map on the group page". Gated behind the admin maps toggle
// (getConnectionSettings().mapsEnabled). Renders nothing when maps are off or
// the circle has no public location set.
//
// PRIVACY: plots ONLY the circle's public meeting location + public event venue
// coordinates. NEVER a member's home/live location, and no member pins.
export async function GroupMapSection({ circle }: { circle: GroupMapCircle }) {
  // Admin maps toggle — when off, render nothing.
  const { mapsEnabled } = await getConnectionSettings()
  if (!mapsEnabled) return null

  // No public location for the circle → nothing to map.
  if (circle.latitude == null || circle.longitude == null) return null

  // Load upcoming events for this circle (same scope query as upcoming-widget).
  const admin = createAdminClient()
  const now = new Date().toISOString()
  const { data: rawEvents } = await admin
    .from('events')
    .select('id, title, starts_at')
    .eq('scope_id', circle.id)
    .in('scope_type', ['circle', 'group']) // accept both during transition
    .eq('is_cancelled', false)
    .gte('starts_at', now)
    .order('starts_at', { ascending: true })
    .limit(10)

  const events: GroupMapEvent[] = ((rawEvents ?? []) as EventRow[]).map((e) => ({
    id: e.id,
    title: e.title,
    dateLabel: formatEventDate(e.starts_at),
    // Events have no coordinates yet → not pinned (never invented).
    latitude: null,
    longitude: null,
  }))

  const place =
    [circle.neighborhood, circle.city].filter(Boolean).join(', ') || null

  const venue: GroupMapVenue = {
    latitude: circle.latitude,
    longitude: circle.longitude,
    name: circle.name,
    place,
  }

  return (
    <ModuleCard title="On the map">
      <p className="mb-2 px-1 text-xs leading-relaxed text-muted">
        Where this circle meets.
      </p>
      <GroupMap venue={venue} events={events} />
    </ModuleCard>
  )
}
