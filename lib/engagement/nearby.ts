// Nearby nodes for a native app's geofences (LIVE-721). The app registers OS geofences around the
// nodes near the member and, when one fires, calls POST /api/v1/nodes/{id}/capture with the device
// location; the server still verifies everything (lib/engagement/verify.ts), so this list only
// says where to listen.
//
// WHAT IT NEVER RETURNS: a node's secret (the signed code a QR or NFC tag carries), an inactive or
// out-of-window node, or a Ghost node's exact point. A Ghost node is meant to be found, so its
// point is rounded to about 110 m and its fence widened to cover the rounding: the app learns the
// neighbourhood, and only standing in the real spot (checked server side) captures it.
//
// Capped: at most MAX_RADIUS_M and MAX_NODES. Server-only: nodes_geo is a service-role RPC.

import { createAdminClient } from '@/lib/supabase/admin'

export const MAX_RADIUS_M = 5000
export const MAX_NODES = 20
/** Ghost points are rounded to 3 decimal places (about 110 m of latitude). */
const GHOST_ROUND = 1000
const GHOST_MIN_FENCE_M = 150

export interface NearbyNode {
  id: string
  type: string
  label: string | null
  lat: number
  lng: number
  /** The fence to register, in metres. */
  radiusM: number
  /** Metres from the caller's point (to the returned point). */
  distanceM: number
}

/** Great-circle distance in metres. */
export function haversineM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000
  const rad = (d: number) => (d * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

type GeoRow = { id: string; lat: number; lng: number; proximity_m: number | null }
type NodeRow = { id: string; type: string; label: string | null; active: boolean; valid_from: string | null; valid_until: string | null }

/** Pure: shape the visible, in-range nodes nearest first. Exported for the test. */
export function shapeNearby(
  at: { lat: number; lng: number },
  radiusM: number,
  geo: GeoRow[],
  nodes: NodeRow[],
  now = Date.now(),
): NearbyNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const out: NearbyNode[] = []
  for (const g of geo) {
    const n = byId.get(g.id)
    if (!n || !n.active) continue
    if (n.valid_from && new Date(n.valid_from).getTime() > now) continue
    if (n.valid_until && new Date(n.valid_until).getTime() < now) continue
    if (haversineM(at, g) > radiusM) continue
    const ghost = n.type === 'ghost'
    const lat = ghost ? Math.round(g.lat * GHOST_ROUND) / GHOST_ROUND : g.lat
    const lng = ghost ? Math.round(g.lng * GHOST_ROUND) / GHOST_ROUND : g.lng
    const fence = g.proximity_m ?? 100
    out.push({
      id: n.id,
      type: n.type,
      label: n.label,
      lat,
      lng,
      radiusM: ghost ? Math.max(fence + 80, GHOST_MIN_FENCE_M) : fence,
      distanceM: Math.round(haversineM(at, { lat, lng })),
    })
  }
  return out.sort((a, b) => a.distanceM - b.distanceM).slice(0, MAX_NODES)
}

/** The live nodes within `radiusM` (capped) of a point, nearest first. */
export async function listNearbyNodes(at: { lat: number; lng: number }, radiusM: number): Promise<NearbyNode[]> {
  const radius = Math.min(Math.max(radiusM, 50), MAX_RADIUS_M)
  const db = createAdminClient()
  const { data: geo, error } = await db.rpc('nodes_geo')
  if (error) throw new Error(`nodes_geo failed: ${error.message}`)
  const near = ((geo ?? []) as GeoRow[]).filter((g) => haversineM(at, g) <= radius)
  if (!near.length) return []
  const { data: nodes, error: nErr } = await db
    .from('nodes')
    .select('id, type, label, active, valid_from, valid_until')
    .in('id', near.map((g) => g.id))
  if (nErr) throw new Error(`nodes read failed: ${nErr.message}`)
  return shapeNearby(at, radius, near, (nodes ?? []) as NodeRow[])
}
