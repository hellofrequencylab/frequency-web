'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getMyProfileId } from '@/lib/auth'
import { tzFromLatLng, isValidTimeZone } from '@/lib/time/zone'

// A plausible IANA timezone: "Area/Location" (or a bare token like "UTC"), id-safe
// characters only, bounded. A SHAPE gate first; the runtime Intl check below is the
// authority (it rejects anything the tz database can't resolve).
const IANA_TZ_RE = /^[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+){0,2}$/

/**
 * Persist the member's browser IANA timezone to `profiles.home_timezone` when it has
 * none on file yet. This populates the durable, server-side anchor the practice-day
 * resolver reads (lib/member-day.ts), so an already-logged practice stays "logged
 * today" until the member's OWN local midnight instead of UTC's (owner directive
 * 2026-06-21, the "Log Practice buttons reset at 4pm PST" bug).
 *
 * FILL-ONCE: only sets the column when empty, so an explicitly chosen home tz (set in
 * Settings, or seeded at onboarding) is never overwritten by whatever device the member
 * happens to load from. Best-effort and fail-closed: any bad input or read/write hiccup
 * is a silent no-op (it must never block a page from rendering).
 */
export async function syncMemberTimezone(tz: string | null): Promise<void> {
  if (!tz || tz.length > 64 || !IANA_TZ_RE.test(tz)) return
  // The runtime tz database is the authority — a tz Intl can't resolve is rejected so a
  // forged value can never land a non-resolvable string in the column.
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: tz })
  } catch {
    return
  }

  const profileId = await getMyProfileId()
  if (!profileId) return

  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('profiles')
      .select('home_timezone')
      .eq('id', profileId)
      .maybeSingle()
    // Already anchored → leave it (fill-once). Only an empty column gets the browser tz.
    if (data?.home_timezone) return
    await admin.from('profiles').update({ home_timezone: tz }).eq('id', profileId)
  } catch {
    /* best-effort: a profile read/write hiccup must never surface to the member */
  }
}

export type LocationResult = { ok: true; timezone: string } | { ok: false; error: string }

/**
 * EXPLICIT member action (vs the fill-once silent sync above): the member shared their
 * device location, so we geolocate the coordinates to an IANA zone (lib/time/zone,
 * accurate worldwide) and OVERWRITE their home_timezone + home_lat/home_lng. This is the
 * "prompted to share your location to set your local timezone" path — because the member
 * asked for it, it wins over a previously-synced browser tz. Fail-closed and never throws.
 */
export async function setMemberLocationFromCoords(lat: number, lng: number): Promise<LocationResult> {
  if (typeof lat !== 'number' || typeof lng !== 'number' || Number.isNaN(lat) || Number.isNaN(lng)) {
    return { ok: false, error: 'Invalid coordinates.' }
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return { ok: false, error: 'Coordinates out of range.' }
  }
  const timezone = tzFromLatLng(lat, lng)
  if (!isValidTimeZone(timezone)) return { ok: false, error: 'Could not resolve a timezone.' }

  const profileId = await getMyProfileId()
  if (!profileId) return { ok: false, error: 'Not signed in.' }

  try {
    // Round coordinates to ~city precision (3 dp ≈ 110m) — we only need them for the
    // timezone + local feed radius, never a precise pin.
    const round = (n: number) => Math.round(n * 1000) / 1000
    const { error } = await createAdminClient()
      .from('profiles')
      .update({ home_timezone: timezone, home_lat: round(lat), home_lng: round(lng) })
      .eq('id', profileId)
    if (error) return { ok: false, error: 'Could not save your location.' }
    return { ok: true, timezone }
  } catch {
    return { ok: false, error: 'Could not save your location.' }
  }
}
