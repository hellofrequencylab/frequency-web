// A RUN: the live sessions of one course offering, saved as ONE seat (owner 2026-11-18, Journeys rework).
//
// A Run is a set of published, public events linked to the same Journey (events.journey_id, ADR-883) and
// marked with the same `details.runKey` (for example `boc-2027-01`). The key is what keeps two Runs of
// the same course apart: saving a seat for the January Run must never seat someone in the April one.
//
// What it changes:
//   · "Save your seat" on any session seats the person for every upcoming session of the same Run
//     (members through setRsvpStatus, signed-out guests through capture_guest_rsvp). Each sibling seat is
//     an ordinary RSVP row, so the existing reminders (7 days, 24 hours, 2 hours before), the calendar
//     export and the host's roster all work per session with no new machinery.
//   · Stepping back from one session leaves the others alone: a person who can't make Week 3 still has
//     Weeks 1, 2 and 4.
//   · /events/run/<runKey>/calendar.ics adds every session of the Run to a calendar in one tap.
import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

interface RunSibling {
  id: string
  slug: string
  title: string
  starts_at: string
  ends_at: string | null
  time_zone: string | null
}

const RUN_KEY_RE = /^[a-z0-9-]{1,64}$/

/** PURE: the Run key an event's details carry, or null. */
function runKeyOf(details: unknown): string | null {
  if (!details || typeof details !== 'object' || Array.isArray(details)) return null
  const k = (details as Record<string, unknown>).runKey
  return typeof k === 'string' && RUN_KEY_RE.test(k) ? k : null
}

/** Every upcoming session of a Run, in order. Public, published, uncancelled only. */
async function runSessions(db: SupabaseClient, runKey: string): Promise<RunSibling[]> {
  if (!RUN_KEY_RE.test(runKey)) return []
  const today = new Date().toISOString().slice(0, 10)
  const { data, error } = await db
    .from('events')
    .select('id, slug, title, starts_at, ends_at, time_zone')
    .eq('details->>runKey', runKey)
    .not('journey_id', 'is', null)
    .eq('status', 'published')
    .eq('visibility', 'public')
    .eq('is_cancelled', false)
    .gte('starts_at', today)
    .order('starts_at', { ascending: true })
    .limit(24)
  if (error) throw new Error(error.message)
  return (data as RunSibling[] | null) ?? []
}

/** The OTHER upcoming sessions of the Run this event belongs to. Empty when it is not part of a Run. */
export async function runSiblings(db: SupabaseClient, eventId: string): Promise<RunSibling[]> {
  const { data } = await db.from('events').select('id, details, journey_id').eq('id', eventId).maybeSingle()
  const row = data as { id: string; details: unknown; journey_id: string | null } | null
  const key = row?.journey_id ? runKeyOf(row.details) : null
  if (!key) return []
  return (await runSessions(db, key)).filter((s) => s.id !== eventId)
}
