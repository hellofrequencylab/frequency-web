'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getMyProfileId } from '@/lib/auth'

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
