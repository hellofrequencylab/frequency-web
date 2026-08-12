'use server'

// The ONE server action behind the Guided rail's opening state (ADR-996): read back the dials
// this author last used on this entity, so a second redraw opens where the first left off.
//
// Entity-blind on purpose, exactly like the store it wraps. It needs no per-entity capability
// gate because it can only ever return the CALLER'S OWN row: the steer is keyed by profile id
// and the id comes from the session, never from the client. There is nothing of anyone else's
// here to leak, and nothing to write (the redraw actions do the saving, each behind its own
// owner gate).

import { getMyProfileId } from '@/lib/auth'
import { loadSteer, type StudioSteer } from '@/lib/studio/steer-store'

export async function loadStudioSteerAction(
  entity: string,
  entityId: string,
): Promise<StudioSteer | null> {
  const profileId = await getMyProfileId()
  if (!profileId) return null
  return loadSteer(entity, entityId, profileId)
}
