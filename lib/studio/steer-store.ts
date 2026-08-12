// ─────────────────────────────────────────────────────────────────────────────
// THE SAVED STEER DIALS (docs/STUDIO.md, ADR-996).
//
// The kernel declares the three dials (mood · directions · lock) and the redraw honours them.
// This is the only thing that remembers them. Without it an author who redraws twice re-picks
// the mood and re-types the directions every time, which made the second redraw cost more
// effort than the first.
//
// SERVER-ONLY. It holds the admin (service-role) client, so it can never be imported from the
// kernel (which stays pure and framework-free) or from a client component. The one table it
// touches, `studio_steer`, is RLS-on-no-policy: this file IS its access path.
//
// PER AUTHOR, keyed (entity, entityId, profileId). The dials are the author's own hand on the
// wheel, so a read can only ever return what the SAME caller wrote. That is what lets the read
// skip a per-entity capability check: there is nothing of anyone else's to leak.
//
// FAIL-SOFT on purpose. Every call is wrapped: if the table is not there yet (the migration
// ships unapplied, by design) or the write loses a race, the redraw still runs and the author
// simply re-picks the mood, exactly as before. Persistence is a convenience and must never be
// the thing that breaks a draft.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizeSeedMood, type SeedMood } from '@/lib/studio/kernel/moods'

/** Untyped admin handle — `studio_steer` is newer than the generated types (ADR-246). */
function db(): SupabaseClient {
  return createAdminClient()
}

/** The three dials, as the rail sets them. */
export interface StudioSteer {
  mood: SeedMood
  directions: string
  locked: string[]
}

/** The longest directions we store. Matches the bound the redraw brief applies. */
const MAX_DIRECTIONS = 600

/**
 * The dials this author last used on this entity, or null when they have never steered it
 * (or the table is not there yet). The mood is normalized on the way out, so a stale or
 * hand-edited value can only ever read back as a real mood.
 */
export async function loadSteer(
  entity: string,
  entityId: string,
  profileId: string,
): Promise<StudioSteer | null> {
  if (!entity || !entityId || !profileId) return null
  try {
    const { data } = await db()
      .from('studio_steer')
      .select('mood, directions, locked')
      .eq('entity', entity)
      .eq('entity_id', entityId)
      .eq('profile_id', profileId)
      .maybeSingle()
    if (!data) return null
    const row = data as { mood: string | null; directions: string | null; locked: string[] | null }
    return {
      mood: normalizeSeedMood(row.mood),
      directions: row.directions ?? '',
      locked: Array.isArray(row.locked) ? row.locked.filter((k): k is string => typeof k === 'string') : [],
    }
  } catch {
    return null
  }
}

/**
 * Remember the dials this author just used. Called on every redraw that passes its gate, so the
 * next visit opens on the same settings. `locked` must already be the DECLARED pins
 * (declaredLockKeys) so a stored pin is always one the manifest offers.
 */
export async function saveSteer(
  entity: string,
  entityId: string,
  profileId: string,
  steer: { mood?: unknown; directions?: string | null; locked?: readonly string[] },
): Promise<void> {
  if (!entity || !entityId || !profileId) return
  try {
    await db()
      .from('studio_steer')
      .upsert(
        {
          entity,
          entity_id: entityId,
          profile_id: profileId,
          mood: normalizeSeedMood(steer.mood),
          directions: (steer.directions ?? '').trim().slice(0, MAX_DIRECTIONS) || null,
          locked: [...new Set(steer.locked ?? [])],
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'entity,entity_id,profile_id' },
      )
  } catch {
    // Never let remembering a dial fail a redraw the author already got.
  }
}
