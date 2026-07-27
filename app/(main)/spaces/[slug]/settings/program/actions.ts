'use server'

// Programs on Channels — the owner actions for the /settings/program surface. ADR-274
// never-trust-client: every action re-resolves the caller and the Space by slug and re-verifies manage
// access + the `program` function gate server-side before any write, exactly like the sibling settings
// actions (airwaves / collaborators). Blueprint sources must be one of THIS Space's own live (non-draft,
// non-archived) circles, re-checked here against the DB — the posted id is never trusted — and the data
// layer re-verifies channel ownership on every edit (a posted channelId from another Space throws).
// v1 was create-only; ADR-869 adds edit, blueprint refresh, and pause/resume. On any failure the
// operator comes back with a short error code the page renders in plain voice.

import { redirect } from 'next/navigation'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveSpaceManageAccess, getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { spaceFunctionAccessLive } from '@/lib/spaces/function-access'
import { listCirclesForSpace } from '@/lib/circles/store'
import {
  createSpaceProgram,
  updateSpaceProgram,
  setProgramPaused,
  refreshProgramBlueprint,
} from '@/lib/channels/programs'
import type { Space } from '@/lib/spaces/types'

function settingsPath(slug: string): string {
  return `/spaces/${slug}/settings/program`
}

/**
 * The shared server-side gate (ADR-274): re-resolve the caller and the Space and require real manage
 * rights (a staff previewer is read-only, so canManage only, never staffViewing) AND the `program`
 * function gate (enabled + admin-level role) the page renders by. Redirects out on any failure, so
 * callers can treat the return as proven.
 */
async function requireProgramManager(slug: string): Promise<{ space: Space; profileId: string }> {
  const caller = await getCallerProfile()
  const viewerProfileId = caller?.id ?? null
  if (!viewerProfileId) redirect(`${settingsPath(slug)}?error=denied`)

  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) redirect(`${settingsPath(slug)}?error=denied`)

  const { canManage } = await resolveSpaceManageAccess(space, viewerProfileId, caller?.webRole)
  const caps = await getSpaceCapabilities(space, viewerProfileId)
  if (!canManage || !(await spaceFunctionAccessLive(space, 'program', caps.role))) {
    redirect(`${settingsPath(slug)}?error=denied`)
  }
  return { space, profileId: viewerProfileId }
}

/** A blueprint source must be one of this Space's OWN live circles — re-resolved from the DB, never
 *  trusted from the form (a posted id from another space or a draft is rejected here). */
async function requireLiveCircle(slug: string, spaceId: string, circleId: string): Promise<string> {
  const circles = await listCirclesForSpace(spaceId)
  const source = circles.find(
    (c) => c.id === circleId && c.status !== 'draft' && c.status !== 'archived',
  )
  if (!source) redirect(`${settingsPath(slug)}?error=circle`)
  return source.id
}

/**
 * Create this Space's Program: a Channel it runs (topical_channels.owner_space_id) with the chosen
 * flagship circle saved as the Chapter blueprint (template_id). Bound to the slug by the page
 * (`createSpaceProgramAction.bind(null, slug)`), so the form posts only the member-entered fields.
 */
export async function createSpaceProgramAction(slug: string, formData: FormData): Promise<void> {
  const { space, profileId } = await requireProgramManager(slug)

  const name = String(formData.get('name') ?? '').trim()
  const oneLiner = String(formData.get('oneLiner') ?? '').trim()
  const sourceCircleId = String(formData.get('sourceCircleId') ?? '').trim()
  if (!name || !oneLiner || !sourceCircleId) redirect(`${settingsPath(slug)}?error=missing`)

  const sourceId = await requireLiveCircle(slug, space.id, sourceCircleId)

  let channelSlug: string
  try {
    const created = await createSpaceProgram({
      spaceId: space.id,
      profileId,
      name,
      oneLiner,
      sourceCircleId: sourceId,
    })
    channelSlug = created.channelSlug
  } catch {
    redirect(`${settingsPath(slug)}?error=failed`)
  }
  redirect(`/channels/${channelSlug}`)
}

/**
 * Edit the Program's display copy (name + one liner). The data layer patches the Channel row and keeps
 * the blueprint's card copy in step; the channel slug never changes, so shared links keep working.
 * Bound by the page (`updateSpaceProgramAction.bind(null, slug, channelId)`); ownership of the posted
 * channelId is re-verified in the data layer, which throws on a Program another Space runs.
 */
export async function updateSpaceProgramAction(
  slug: string,
  channelId: string,
  formData: FormData,
): Promise<void> {
  const { space, profileId } = await requireProgramManager(slug)

  const name = String(formData.get('name') ?? '').trim()
  const oneLiner = String(formData.get('oneLiner') ?? '').trim()
  if (!name || !oneLiner) redirect(`${settingsPath(slug)}?error=missing`)

  try {
    await updateSpaceProgram({
      spaceId: space.id,
      profileId,
      channelId,
      patch: { name, oneLiner },
    })
  } catch {
    redirect(`${settingsPath(slug)}?error=failed`)
  }
  redirect(`${settingsPath(slug)}?saved=1`)
}

/**
 * Re-snapshot the blueprint from one of the Space's live circles. Existing Chapters keep the setup they
 * started with; only future Chapters start from the new snapshot. Same source checks as create.
 */
export async function refreshProgramBlueprintAction(
  slug: string,
  channelId: string,
  formData: FormData,
): Promise<void> {
  const { space, profileId } = await requireProgramManager(slug)

  const sourceCircleId = String(formData.get('sourceCircleId') ?? '').trim()
  if (!sourceCircleId) redirect(`${settingsPath(slug)}?error=missing`)
  const sourceId = await requireLiveCircle(slug, space.id, sourceCircleId)

  try {
    await refreshProgramBlueprint({ spaceId: space.id, profileId, channelId, sourceCircleId: sourceId })
  } catch {
    redirect(`${settingsPath(slug)}?error=failed`)
  }
  redirect(`${settingsPath(slug)}?saved=1`)
}

/**
 * Pause or resume the Program: flips the same is_active retire switch startChapter respects (ADR-865).
 * Paused: the Channel page is hidden and no new Chapters can start. Members and Chapters keep
 * everything they have. Fully bound by the page (slug, channelId, paused); the trailing FormData is the
 * form-action calling convention, unused.
 */
export async function setProgramPausedAction(
  slug: string,
  channelId: string,
  paused: boolean,
  _formData: FormData,
): Promise<void> {
  const { space, profileId } = await requireProgramManager(slug)

  try {
    await setProgramPaused({ spaceId: space.id, profileId, channelId, paused })
  } catch {
    redirect(`${settingsPath(slug)}?error=failed`)
  }
  redirect(`${settingsPath(slug)}?saved=1`)
}
