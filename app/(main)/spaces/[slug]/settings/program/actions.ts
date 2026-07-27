'use server'

// Programs on Channels — the create action for the /settings/program owner surface. ADR-274
// never-trust-client: the action re-resolves the caller and the Space by slug and re-verifies manage
// access + the `program` function gate server-side before any write, exactly like the sibling settings
// actions (airwaves / collaborators). The blueprint source must be one of THIS Space's own live (non-draft,
// non-archived) circles, re-checked here against the DB — the posted id is never trusted. On success the
// operator lands on the new Program's Channel page; on any failure they come back with a short error code
// the page renders in plain voice.

import { redirect } from 'next/navigation'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveSpaceManageAccess, getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { spaceFunctionAccessLive } from '@/lib/spaces/function-access'
import { listCirclesForSpace } from '@/lib/circles/store'
import { createSpaceProgram } from '@/lib/channels/programs'

function settingsPath(slug: string): string {
  return `/spaces/${slug}/settings/program`
}

/**
 * Create this Space's Program: a Channel it runs (topical_channels.owner_space_id) with the chosen
 * flagship circle saved as the Chapter blueprint (template_id). Bound to the slug by the page
 * (`createSpaceProgramAction.bind(null, slug)`), so the form posts only the member-entered fields.
 */
export async function createSpaceProgramAction(slug: string, formData: FormData): Promise<void> {
  const caller = await getCallerProfile()
  const viewerProfileId = caller?.id ?? null
  if (!viewerProfileId) redirect(`${settingsPath(slug)}?error=denied`)

  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) redirect(`${settingsPath(slug)}?error=denied`)

  // Re-verify server-side: real manage rights (a staff previewer is read-only, so canManage only, never
  // staffViewing) AND the `program` function gate (enabled + admin-level role) the page renders by.
  const { canManage } = await resolveSpaceManageAccess(space, viewerProfileId, caller?.webRole)
  const caps = await getSpaceCapabilities(space, viewerProfileId)
  if (!canManage || !(await spaceFunctionAccessLive(space, 'program', caps.role))) {
    redirect(`${settingsPath(slug)}?error=denied`)
  }

  const name = String(formData.get('name') ?? '').trim()
  const oneLiner = String(formData.get('oneLiner') ?? '').trim()
  const sourceCircleId = String(formData.get('sourceCircleId') ?? '').trim()
  if (!name || !oneLiner || !sourceCircleId) redirect(`${settingsPath(slug)}?error=missing`)

  // The blueprint must be one of this Space's OWN live circles — re-resolved from the DB, never trusted
  // from the form (a posted id from another space or a draft is rejected here).
  const circles = await listCirclesForSpace(space.id)
  const source = circles.find(
    (c) => c.id === sourceCircleId && c.status !== 'draft' && c.status !== 'archived',
  )
  if (!source) redirect(`${settingsPath(slug)}?error=circle`)

  let channelSlug: string
  try {
    const created = await createSpaceProgram({
      spaceId: space.id,
      profileId: viewerProfileId,
      name,
      oneLiner,
      sourceCircleId: source.id,
    })
    channelSlug = created.channelSlug
  } catch {
    redirect(`${settingsPath(slug)}?error=failed`)
  }
  redirect(`/channels/${channelSlug}`)
}
