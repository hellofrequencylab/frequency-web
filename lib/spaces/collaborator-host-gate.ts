// COLLABORATOR HOST WALL (LIVE-430). The write already asks
// spaceCanHostCollaborators → featureAllowed('space_collaborators'). The leftover
// after LIVE-228 / the Business floor was a typed retired-tier sentence on the
// writers and the locked preview. One seam names the wall through
// featureWallLabel so an operator override moves the word with the gate.
//
// ADR-1477 left this paid-floor leftover alone while it fixed member tickets.
// LIVE-228 retired that tier label. The code default is Business.

import { loadFeatureGateOverrides } from '@/lib/pricing/gates'
import { featureWallLabel } from '@/lib/pricing/feature-tiers'
import { SPACE_PLAN_LABEL } from '@/lib/pricing/plans'

export const COLLABORATOR_HOST_FEATURE = 'space_collaborators' as const

export type CollaboratorHostWallKind = 'space' | 'event-home' | 'event-host-space'

/** The same seam the Space writers, the event-share writers, and the locked
 *  preview ask. PURE sentence, IO wall. */
export function collaboratorHostWallSentence(
  wall: string,
  kind: CollaboratorHostWallKind,
): string {
  if (kind === 'space') {
    return `Hosting collaborators comes with ${wall}. Upgrade this space to invite and approve collaborators.`
  }
  if (kind === 'event-home') {
    return `Collaborator hosting comes with ${wall}. Upgrade the event's home Space to bring Collaborators on.`
  }
  return `Collaborator hosting comes with ${wall}. The event's host Space needs it before this event can take on Collaborators.`
}

export function collaboratorHostPreviewSentence(wall: string): string {
  return `Hosting collaborators comes with ${wall}. The businesses you host pay for their own space, so it costs you nothing extra per collaborator.`
}

export async function resolveCollaboratorHostWall(): Promise<string> {
  const overrides = await loadFeatureGateOverrides()
  return featureWallLabel(COLLABORATOR_HOST_FEATURE, overrides) ?? SPACE_PLAN_LABEL.business
}

export async function collaboratorHostRefusal(
  kind: CollaboratorHostWallKind,
): Promise<string> {
  return collaboratorHostWallSentence(await resolveCollaboratorHostWall(), kind)
}
