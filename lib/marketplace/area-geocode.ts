import 'server-only'
import { nominatimSearch } from '@/lib/events/nominatim'

// Approximate coordinates for a coarse place label (a neighborhood/city string), used to draw a
// listing's pickup AREA map when the listing itself has no stored latitude/longitude. This is
// deliberately city/neighborhood level, never a precise address: it powers the soft "approximate
// area" circle, honoring the privacy contract (the exact pickup spot is shared only when the seller
// reveals it). Server-only (it hits the Nominatim geocoder behind the repo's rate limiter).
//
// Process-memoized (including misses) so a busy Classifieds vertical geocodes each distinct area at
// most once per process, never once per page view — Nominatim's usage policy is one request/second.

const memo = new Map<string, { lat: number; lng: number } | null>()

export async function approxCoordsForArea(label: string | null | undefined): Promise<{ lat: number; lng: number } | null> {
  const key = (label ?? '').trim().toLowerCase()
  if (!key) return null
  if (memo.has(key)) return memo.get(key) ?? null

  let coords: { lat: number; lng: number } | null = null
  try {
    const rows = await nominatimSearch({ q: key, format: 'json', limit: '1' })
    const first = Array.isArray(rows) ? (rows[0] as { lat?: string; lon?: string } | undefined) : undefined
    const lat = first?.lat ? Number(first.lat) : NaN
    const lng = first?.lon ? Number(first.lon) : NaN
    if (Number.isFinite(lat) && Number.isFinite(lng)) coords = { lat, lng }
  } catch {
    coords = null
  }
  memo.set(key, coords)
  return coords
}
