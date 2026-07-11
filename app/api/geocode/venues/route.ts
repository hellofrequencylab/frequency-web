import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { rateLimitOk, clientIp, tooMany } from '@/lib/rate-limit'
import { searchVenues } from '@/lib/events/venue-search'

// Server-side venue / address autocomplete for the event editor.
//
// This MUST be a server route: it proxies OpenStreetMap Nominatim, whose usage policy
// forbids browser autocomplete and requires a contact User-Agent (both handled in
// lib/events/nominatim). The local-first cascade lives in lib/events/venue-search.
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

  const results = await searchVenues(q, bias, request.signal)
  return NextResponse.json(results)
}
