'use server'

// Server actions for the per-Space Vera co-host (ENTITY-SPACES, Phase 1). The thin action
// API the profile-edit UI calls to get writing-coach questions from Vera. The server is the source of
// truth for authorization: every action resolves the Space, gates on
// getSpaceCapabilities(space, caller).canEditProfile, and only then runs the SEAM
// (lib/ai/space-copilot.ts). Best-effort: the SEAM never throws, so these never block — a
// signed-out / unauthorized caller gets a clean `fail`, everyone else gets coaching questions.
//
// SCOPE: this owns only the AI-draft actions. The profile-edit route + the entity modules
// that persist the chosen copy are wired elsewhere; these actions return guidance and never persist content.

import { getMyProfileId } from '@/lib/auth'
import { getSpaceById } from '@/lib/spaces/store'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import {
  draftSpaceBio,
  suggestTagline,
  type SpaceContext,
} from '@/lib/ai/space-copilot'
import { loadSpaceGrounding } from '@/lib/ai/space-grounding'
import { authorizeDiscoveryEditor } from '@/lib/spaces/discovery-access'
import { loadSpaceCoachProfile } from '@/lib/spaces/private-state'
import { type ActionResult, ok, fail } from '@/lib/action-result'

/** Resolve the caller + the Space and confirm they may edit its profile. Returns the Space
 *  context the SEAM needs, or an error to short-circuit. The server is the authority — the UI
 *  gate is convenience only. */
async function authorizeEdit(
  spaceId: string,
  currentDraft?: string,
): Promise<{ ctx: SpaceContext } | { error: string }> {
  const profileId = await getMyProfileId()
  if (!profileId) return { error: 'Not signed in' }

  const space = await getSpaceById(spaceId)
  if (!space) return { error: 'Space not found' }

  const caps = await getSpaceCapabilities(space, profileId)
  if (!caps.canEditProfile) return { error: 'You do not have permission to edit this Space' }
  // The private coach profile is owner/editor only; staff and network reach must not load it into a prompt.
  if (!(await authorizeDiscoveryEditor(spaceId))) return { error: 'You do not have permission to edit this Space' }

  // The Space's own About and live offerings ground the draft (LIVE-676).
  const grounding = await loadSpaceGrounding(spaceId)
  const coach = await loadSpaceCoachProfile(space.id)
  return {
    ctx: {
      spaceId,
      name: space.name,
      type: space.type,
      brandName: space.brandName,
      about: typeof currentDraft === 'string' ? currentDraft.slice(0, 4000) : grounding.about,
      offerings: grounding.offerings,
      profileId,
      coachProfile: coach.available ? coach.profile : null,
    },
  }
}

/** Coach the owner on their bio/about. Historical action name; returns questions only. */
export async function draftSpaceBioAction(spaceId: string, currentDraft?: string): Promise<ActionResult<string>> {
  const auth = await authorizeEdit(spaceId, currentDraft)
  if ('error' in auth) return fail(auth.error)
  const text = await draftSpaceBio(auth.ctx)
  return ok(text)
}

/** Coach the owner on their tagline. Historical action name; returns questions only. */
export async function suggestTaglineAction(spaceId: string, currentDraft?: string): Promise<ActionResult<string>> {
  const auth = await authorizeEdit(spaceId, currentDraft)
  if ('error' in auth) return fail(auth.error)
  const text = await suggestTagline(auth.ctx)
  return ok(text)
}
