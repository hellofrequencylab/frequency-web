'use server'

// Server actions for the per-Space Vera co-host (ENTITY-SPACES, Phase 1). The thin action
// API the profile-edit UI calls to have Vera DRAFT profile copy. The server is the source of
// truth for authorization: every action resolves the Space, gates on
// getSpaceCapabilities(space, caller).canEditProfile, and only then runs the SEAM
// (lib/ai/space-copilot.ts). Best-effort: the SEAM never throws, so these never block — a
// signed-out / unauthorized caller gets a clean `fail`, everyone else gets a draft string.
//
// SCOPE: this owns only the AI-draft actions. The profile-edit route + the entity modules
// that persist the chosen copy are wired elsewhere; these actions just return a draft.

import { getMyProfileId } from '@/lib/auth'
import { getSpaceById } from '@/lib/spaces/store'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import {
  draftSpaceBio,
  draftOfferingBlurb,
  suggestTagline,
  type OfferingContext,
  type SpaceContext,
} from '@/lib/ai/space-copilot'
import { type ActionResult, ok, fail } from '@/lib/action-result'

/** Resolve the caller + the Space and confirm they may edit its profile. Returns the Space
 *  context the SEAM needs, or an error to short-circuit. The server is the authority — the UI
 *  gate is convenience only. */
async function authorizeEdit(
  spaceId: string,
): Promise<{ ctx: SpaceContext } | { error: string }> {
  const profileId = await getMyProfileId()
  if (!profileId) return { error: 'Not signed in' }

  const space = await getSpaceById(spaceId)
  if (!space) return { error: 'Space not found' }

  const caps = await getSpaceCapabilities(space, profileId)
  if (!caps.canEditProfile) return { error: 'You do not have permission to edit this Space' }

  return {
    ctx: {
      name: space.name,
      type: space.type,
      brandName: space.brandName,
      profileId,
    },
  }
}

/** Draft a short bio/about for a Space. Owner/admin/editor only. Returns the draft string. */
export async function draftSpaceBioAction(spaceId: string): Promise<ActionResult<string>> {
  const auth = await authorizeEdit(spaceId)
  if ('error' in auth) return fail(auth.error)
  const text = await draftSpaceBio(auth.ctx)
  return ok(text)
}

/** Draft a short blurb for one offering. Accepts either an offering id (resolved by the
 *  caller-side entity module later) or free text the owner typed; here we pass through the
 *  text. Owner/admin/editor only. */
export async function draftOfferingBlurbAction(
  spaceId: string,
  offering: string,
): Promise<ActionResult<string>> {
  const auth = await authorizeEdit(spaceId)
  if ('error' in auth) return fail(auth.error)
  // The offering-id lookup against the entity module is owned by a later step; for Phase 1 the
  // action grounds the blurb in the free text the editor passes (a title and/or details).
  const o: OfferingContext = { text: offering }
  const text = await draftOfferingBlurb(auth.ctx, o)
  return ok(text)
}

/** Suggest a short tagline for a Space. Owner/admin/editor only. */
export async function suggestTaglineAction(spaceId: string): Promise<ActionResult<string>> {
  const auth = await authorizeEdit(spaceId)
  if ('error' in auth) return fail(auth.error)
  const text = await suggestTagline(auth.ctx)
  return ok(text)
}
