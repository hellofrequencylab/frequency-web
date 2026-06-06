// Browser geolocation as a promise — used by "use my location" (listing create/edit)
// and "near me" sorting (marketplace browse). Resolves null if unavailable or denied,
// so callers degrade gracefully. Client-only (guards `navigator`).

export function getBrowserPosition(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve(null)
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300_000 },
    )
  })
}
