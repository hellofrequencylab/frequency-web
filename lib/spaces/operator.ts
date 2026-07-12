import { getCallerProfile } from '@/lib/auth'
import { getSpaceCapabilities, type SpaceLike } from '@/lib/spaces/entitlements'

// VIEWER-IS-OPERATOR gate for the unconfigured-CTA setup prompts (entity-cta + the member transactional
// surfaces). When a Space's primary action surface has nothing configured, a MEMBER keeps seeing the calm
// "nothing here yet" empty state; an OPERATOR (owner / admin / editor) instead sees an owner setup prompt
// that links to the exact config. This is the one place that resolves "may this viewer edit this Space".
//
// It composes the existing authorities (getCallerProfile for who is asking, getSpaceCapabilities for what
// they may do), so the caller passes only the minimal SpaceLike it already holds (id + ownerProfileId) and
// never re-fetches the Space. FAIL-SAFE: an anonymous viewer or any lookup error resolves to false, so a
// member never sees the owner prompt.

/** Whether the current viewer may EDIT this Space (owner / admin / editor), the operator gate the
 *  unconfigured-CTA setup prompts use to show owner guidance instead of the member empty state. Reuses
 *  getSpaceCapabilities.canEditProfile (the same write authority the config surfaces gate on).
 *  FAIL-SAFE to false. */
export async function viewerManagesSpace(space: SpaceLike): Promise<boolean> {
  const caller = await getCallerProfile()
  if (!caller?.id) return false
  const caps = await getSpaceCapabilities(space, caller.id)
  return caps.canEditProfile
}
