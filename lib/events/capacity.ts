import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'

// Capacity / waitlist helpers for events.
//
// `events.capacity` + the 'waitlist' RSVP status are newer than the generated
// DB types (lib/database.types.ts), so we read/write them through an untyped
// client — the established convention in this repo for not-yet-regenerated
// columns (see lib/billing/* for the same pattern).

export interface CapacityInfo {
  /** null = unlimited */
  capacity: number | null
  /** confirmed 'going' RSVP rows */
  going: number
  /** remaining spots; null = unlimited */
  spotsLeft: number | null
  isFull: boolean
}

function untyped(): SupabaseClient {
  return createAdminClient()
}

export async function getCapacityInfo(eventId: string): Promise<CapacityInfo> {
  const admin = untyped()
  const [evRes, countRes] = await Promise.all([
    admin.from('events').select('capacity').eq('id', eventId).maybeSingle(),
    admin
      .from('event_rsvps')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', eventId)
      .eq('status', 'going'),
  ])

  const capacity: number | null =
    typeof evRes.data?.capacity === 'number' ? evRes.data.capacity : null
  const going = countRes.count ?? 0
  const spotsLeft = capacity == null ? null : Math.max(0, capacity - going)
  const isFull = capacity != null && going >= capacity

  return { capacity, going, spotsLeft, isFull }
}

/**
 * Promote the oldest waitlisted RSVP to 'going' when a spot frees up.
 * Returns the promoted profile id (so the caller can notify them), or null.
 * Best-effort, low-volume: capacity is checked again before promoting.
 */
export async function promoteFromWaitlist(eventId: string): Promise<string | null> {
  const { isFull } = await getCapacityInfo(eventId)
  if (isFull) return null

  const admin = untyped()
  const { data: next } = await admin
    .from('event_rsvps')
    .select('id, profile_id')
    .eq('event_id', eventId)
    .eq('status', 'waitlist')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!next) return null
  await admin.from('event_rsvps').update({ status: 'going' }).eq('id', next.id)
  return (next.profile_id as string) ?? null
}
