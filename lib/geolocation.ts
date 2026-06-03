// Approximate viewer location via IP — no permission prompt, city-level accuracy.
// Used to centre maps and rank by nearest before (or instead of) precise browser
// geolocation. Browser-only: calls a public IP-geo endpoint. Returns null on any
// failure (network, abort, or missing coords); callers treat null as "unknown".
export async function getApproxLocationByIP(
  signal?: AbortSignal,
): Promise<{ lat: number; lng: number } | null> {
  try {
    const res = await fetch('https://ipapi.co/json/', { signal })
    const d = (await res.json()) as { latitude?: number; longitude?: number }
    if (typeof d?.latitude === 'number' && typeof d?.longitude === 'number') {
      return { lat: d.latitude, lng: d.longitude }
    }
  } catch {
    // network/abort — fall through to null
  }
  return null
}
