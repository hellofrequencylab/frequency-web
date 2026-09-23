import 'server-only'

// THE SPACE'S OWN TIME ZONE (LIVE-471, migration 20270345008300).
//
// One reader and one writer for `spaces.time_zone`, the zone a Space keeps its SCHEDULE in. This is
// the fact the calendar defaults new Pencils and Vera proposals to, and the words the console header
// prints beside the month (lib/time/zone-words.ts turns it into "Pacific Time").
//
// STORED, NEVER DERIVED (owner ruling 2026-09-22). Deriving it per read was rejected: a Space with
// two venues in different zones has no answer that way, and a co-host in another country would
// change the Space's zone by existing. The migration backfilled every existing Space once, from its
// events' zone, then its owner's zone, then the house zone; after that the only thing that changes
// it is a person choosing in Space settings.
//
// FAIL-SAFE ON READ, and this is deliberate. `readSpaceTimeZone` returns NULL rather than throwing
// for a missing row, a rejected select or a stored value that is not a usable IANA name. Null is a
// meaningful answer here ("this Space has never said"), and every caller already has to handle it,
// so the calendar keeps working against a database where the migration has not landed yet: it falls
// back to the viewer's browser zone, which is exactly what it did before this row.

import { createAdminClient } from '@/lib/supabase/admin'
import { isValidTimeZone } from '@/lib/time/zone'
import { log } from '@/lib/log'

/** The Space's stored zone, or null when it has never said (or said something unusable). */
export async function readSpaceTimeZone(spaceId: string): Promise<string | null> {
  if (!spaceId) return null
  try {
    const { data, error } = await createAdminClient()
      .from('spaces')
      .select('time_zone')
      .eq('id', spaceId)
      .maybeSingle()
    if (error) {
      // Loud, not silent (AGENTS.md: a swallowed error is an invisible regression). The calendar
      // still renders; it just goes back to guessing from the browser until this is looked at.
      log.warn('space_zone_read_failed', { spaceId, message: error.message })
      return null
    }
    const stored = data?.time_zone ?? null
    return isValidTimeZone(stored) ? stored : null
  } catch (err) {
    log.warn('space_zone_read_threw', { spaceId, message: err instanceof Error ? err.message : 'unknown' })
    return null
  }
}

/** Write a Space's zone. `null` clears it back to "never said". Returns false when the write failed.
 *  Gating belongs to the caller; this is the store half only. */
export async function writeSpaceTimeZone(spaceId: string, zone: string | null): Promise<boolean> {
  try {
    const { error } = await createAdminClient()
      .from('spaces')
      .update({ time_zone: zone })
      .eq('id', spaceId)
    if (error) {
      log.warn('space_zone_write_failed', { spaceId, message: error.message })
      return false
    }
    return true
  } catch (err) {
    log.warn('space_zone_write_threw', { spaceId, message: err instanceof Error ? err.message : 'unknown' })
    return false
  }
}
