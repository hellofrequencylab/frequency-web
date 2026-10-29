// THE LAUNCH CLOCK (the read and write half). The active time lives on the launch row (clock_active_ms,
// clock_last_beat_at), written only through applyBeat so a heartbeat can never add more than 30 seconds. Both calls run
// under the person's own session (RLS: owner only) and name the owner. Server-only. A failed read or write is "no
// clock", never a thrown page: the launch carries on without it.

import { createClient } from '@/lib/supabase/server'
import { applyBeat, type BeatKind } from './clock'

interface Kept {
  activeMs: number
  lastBeatAt: string | null
}

async function readKept(launchId: string, ownerId: string): Promise<Kept | null> {
  const db = await createClient()
  const { data } = await db.from('space_launch').select('clock_active_ms, clock_last_beat_at').eq('id', launchId).eq('owner_id', ownerId).maybeSingle()
  return data ? { activeMs: data.clock_active_ms, lastBeatAt: data.clock_last_beat_at } : null
}

/** The active milliseconds kept on this person's launch, or null when it cannot be read. */
export async function loadClockMs(launchId: string, ownerId: string): Promise<number | null> {
  try {
    return (await readKept(launchId, ownerId))?.activeMs ?? null
  } catch {
    return null
  }
}

/** Record one heartbeat on an active launch and return the active milliseconds now kept. The write only lands if the
 *  row is unchanged since it was read, so two open tabs beating at once count the moment once, not twice. */
export async function recordClockBeat(launchId: string, ownerId: string, kind: BeatKind, now = new Date()): Promise<number | null> {
  try {
    const db = await createClient()
    for (let attempt = 0; attempt < 2; attempt++) {
      const kept = await readKept(launchId, ownerId)
      if (!kept) return null
      const next = applyBeat(kept, kind, now)
      let q = db.from('space_launch').update({ clock_active_ms: next.activeMs, clock_last_beat_at: next.lastBeatAt }).eq('id', launchId).eq('owner_id', ownerId).is('cancelled_at', null).is('completed_at', null).eq('clock_active_ms', kept.activeMs)
      q = kept.lastBeatAt === null ? q.is('clock_last_beat_at', null) : q.eq('clock_last_beat_at', kept.lastBeatAt)
      const { data, error } = await q.select('clock_active_ms')
      if (error) return null
      if (data && data.length > 0) return next.activeMs
    }
    return (await readKept(launchId, ownerId))?.activeMs ?? null
  } catch {
    return null
  }
}
