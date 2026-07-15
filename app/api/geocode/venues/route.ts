import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { rateLimitOk, clientIp, tooMany } from '@/lib/rate-limit'
import { searchVenues } from '@/lib/events/venue-search'
import { googlePlacesSearch } from '@/lib/events/google-places'

// Server-side venue / address autocomplete for the event editor.
//
// This MUST be a server route: it either proxies Google Places (when GOOGLE_MAPS_API_KEY
// is set — the key stays secret here) OR OpenStreetMap Nominatim, whose usage policy
// forbids browser autocomplete and requires a contact User-Agent (both handled in
// lib/events/nominatim). The local-first cascade lives in lib/events/venue-search.
//
// PROVIDER SELECTION: with a key, Google Places leads (best US house-number coverage);
// its result is used when it yields anything, and ANY Google failure — or a Google miss —
// falls back to the keyless Nominatim cascade, so search always degrades gracefully.
//
// Guarded two ways so we can't be used as an open geocoding proxy: an auth gate (the
// editor caller is always a signed-in host) and a per-IP rate limit. The shared
// in-process serialiser keeps us within Nominatim's ~1 req/sec courtesy limit, and
// `request.signal` cancels the upstream fetch when the client aborts a stale keystroke.

export async function GET(request: Request) {
  if (!(await rateLimitOk('geocode-venues', clientIp(request), 30, '60 s'))) return tooMany()

  const { searchParams } = new URL(request.url)
  const q = (searchParams.get('q') ?? '').trim().slice(0, 120)
  if (q.length < 2) return NextResponse.json([])

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json([], { status: 401 })

  const lat = Number(searchParams.get('lat'))
  const lng = Number(searchParams.get('lng'))
  const bias = Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null

  // Prefer Google Places when a key is configured (best US house-number matching).
  // googlePlacesSearch never throws — it returns null on any failure / no key — so a
  // null OR an empty result both fall through to the keyless Nominatim cascade.
  if (process.env.GOOGLE_MAPS_API_KEY) {
    const google = await googlePlacesSearch(q, bias, request.signal)
    if (google && google.length > 0) return NextResponse.json(google)
  }

  const results = await searchVenues(q, bias, request.signal)
  return NextResponse.json(results)
}
