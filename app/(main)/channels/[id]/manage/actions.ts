'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getMyProfileId } from '@/lib/auth'
import { getChannelCapabilities } from '@/lib/core/load-capabilities'
import {
  attachProgramBlueprint,
  detachProgramBlueprint,
  updateProgramForStaff,
  setProgramPausedForStaff,
  refreshProgramBlueprintForStaff,
  setCircleChannel,
  removeCircleFromChannel,
  setChannelOwnerSpace,
  type BlueprintSource,
} from '@/lib/channels/programs'

// Channel Manage hub actions (ADR-870). Every action runs on the admin client
// downstream (RLS-bypassing data layer), so it re-checks channel.manage — the
// staff capability (ADR-274) — BEFORE mutating, the same posture as the event
// manage actions. The data layer (lib/channels/programs) only ever WRITES;
// authorization is entirely this file's job. The Space-owned Program path
// (spaces/[slug]/settings/program/actions.ts) is untouched: these are the
// staff twins, gated on the channel scope instead of Space ownership.

const MAX_NAME = 80
const MAX_ONE_LINER = 200

/** Is the caller allowed to manage this channel? channel.manage resolves to
 *  platform staff only (capabilities.ts). Mirrors the page gate so a direct
 *  POST can never bypass it. Returns the caller's profile id when authorized,
 *  else null. */
async function authorizeChannelManager(channelId: string): Promise<string | null> {
  const profileId = await getMyProfileId()
  if (!profileId) return null
  const caps = await getChannelCapabilities(channelId)
  return caps.has('channel.manage') ? profileId : null
}

function managePath(idOrSlug: string): string {
  return `/channels/${idOrSlug}/manage`
}

function revalidateManage(idOrSlug: string) {
  revalidatePath(managePath(idOrSlug))
  revalidatePath(`/channels/${idOrSlug}`)
  revalidatePath('/channels')
}

// ── Circles: add an existing circle, or take one out (ADR-871) ───────────────

/** Add an existing circle to this channel: sets circles.topical_channel_id.
 *  The data layer refuses a paused channel — the same is_active retire switch
 *  startChapter honors (ADR-865) — which surfaces as its own notice. */
export async function addChannelCircleAction(
  channelId: string,
  idOrSlug: string,
  formData: FormData,
): Promise<void> {
  const profileId = await authorizeChannelManager(channelId)
  if (!profileId) redirect(`${managePath(idOrSlug)}?section=circles&error=denied`)

  const circleId = String(formData.get('circleId') ?? '').trim()
  if (!circleId) redirect(`${managePath(idOrSlug)}?section=circles&error=missing`)

  try {
    await setCircleChannel({ circleId, channelId })
  } catch (err) {
    const paused = err instanceof Error && /paused/.test(err.message)
    redirect(`${managePath(idOrSlug)}?section=circles&error=${paused ? 'paused' : 'failed'}`)
  }
  revalidateManage(idOrSlug)
  redirect(`${managePath(idOrSlug)}?section=circles&saved=1`)
}

/** Take a circle out of this channel (clears topical_channel_id). The circle
 *  keeps its host, members, and events; it just stops practicing here. Called
 *  directly by the quiet-confirm button, not through a form. */
export async function removeChannelCircleAction(
  channelId: string,
  idOrSlug: string,
  circleId: string,
): Promise<void> {
  const profileId = await authorizeChannelManager(channelId)
  if (!profileId) redirect(`${managePath(idOrSlug)}?section=circles&error=denied`)

  try {
    await removeCircleFromChannel({ circleId, channelId })
  } catch {
    redirect(`${managePath(idOrSlug)}?section=circles&error=failed`)
  }
  revalidateManage(idOrSlug)
  redirect(`${managePath(idOrSlug)}?section=circles&saved=1`)
}

// ── Owner Space (ADR-871) ─────────────────────────────────────────────────────

/** Assign the channel's owner Space. The data layer holds the line the DB's
 *  unique index draws (one owned channel per Space, migration 20270112000000)
 *  and re-stamps the blueprint's owner when the channel runs a Program. */
export async function setChannelOwnerSpaceAction(
  channelId: string,
  idOrSlug: string,
  formData: FormData,
): Promise<void> {
  const profileId = await authorizeChannelManager(channelId)
  if (!profileId) redirect(`${managePath(idOrSlug)}?section=program&error=denied`)

  const spaceId = String(formData.get('spaceId') ?? '').trim()
  if (!spaceId) redirect(`${managePath(idOrSlug)}?section=program&error=missing`)

  try {
    await setChannelOwnerSpace({ channelId, profileId, spaceId })
  } catch (err) {
    const owned = err instanceof Error && /already owns/.test(err.message)
    redirect(`${managePath(idOrSlug)}?section=program&error=${owned ? 'owned' : 'failed'}`)
  }
  revalidateManage(idOrSlug)
  redirect(`${managePath(idOrSlug)}?section=program&saved=1`)
}

/** Clear the owner Space: the channel goes back to Frequency-run
 *  (owner_space_id NULL), and a Program's blueprint owner clears with it. */
export async function clearChannelOwnerSpaceAction(
  channelId: string,
  idOrSlug: string,
  _formData: FormData,
): Promise<void> {
  const profileId = await authorizeChannelManager(channelId)
  if (!profileId) redirect(`${managePath(idOrSlug)}?section=program&error=denied`)

  try {
    await setChannelOwnerSpace({ channelId, profileId, spaceId: null })
  } catch {
    redirect(`${managePath(idOrSlug)}?section=program&error=failed`)
  }
  revalidateManage(idOrSlug)
  redirect(`${managePath(idOrSlug)}?section=program&saved=1`)
}

// ── Program lifecycle ────────────────────────────────────────────────────────

/** Attach a Chapter blueprint, making the channel a Program: snapshot a live
 *  circle, or clone a Starter template (the original stays in the catalog).
 *  Bound by the page (channelId + idOrSlug); the form posts only the source. */
export async function attachChannelProgramAction(
  channelId: string,
  idOrSlug: string,
  formData: FormData,
): Promise<void> {
  const profileId = await authorizeChannelManager(channelId)
  if (!profileId) redirect(`${managePath(idOrSlug)}?section=program&error=denied`)

  const kind = String(formData.get('source') ?? '')
  let source: BlueprintSource
  if (kind === 'circle') {
    const circleId = String(formData.get('circleId') ?? '').trim()
    if (!circleId) redirect(`${managePath(idOrSlug)}?section=program&error=missing`)
    source = { kind: 'circle', circleId }
  } else if (kind === 'starter') {
    const templateId = String(formData.get('templateId') ?? '').trim()
    if (!templateId) redirect(`${managePath(idOrSlug)}?section=program&error=missing`)
    source = { kind: 'starter', templateId }
  } else {
    redirect(`${managePath(idOrSlug)}?section=program&error=missing`)
  }

  try {
    await attachProgramBlueprint({ channelId, profileId, source })
  } catch {
    redirect(`${managePath(idOrSlug)}?section=program&error=failed`)
  }
  revalidateManage(idOrSlug)
  redirect(`${managePath(idOrSlug)}?section=program&saved=1`)
}

/** Edit the Program's display copy (name + one liner). The data layer patches
 *  the Channel row and keeps the blueprint's card copy in step; the channel
 *  slug never changes, so shared links keep working. */
export async function updateChannelProgramAction(
  channelId: string,
  idOrSlug: string,
  formData: FormData,
): Promise<void> {
  const profileId = await authorizeChannelManager(channelId)
  if (!profileId) redirect(`${managePath(idOrSlug)}?section=program&error=denied`)

  const name = String(formData.get('name') ?? '').trim().slice(0, MAX_NAME)
  const oneLiner = String(formData.get('oneLiner') ?? '').trim().slice(0, MAX_ONE_LINER)
  if (!name || !oneLiner) redirect(`${managePath(idOrSlug)}?section=program&error=missing`)

  try {
    await updateProgramForStaff({ channelId, profileId, patch: { name, oneLiner } })
  } catch {
    redirect(`${managePath(idOrSlug)}?section=program&error=failed`)
  }
  revalidateManage(idOrSlug)
  redirect(`${managePath(idOrSlug)}?section=program&saved=1`)
}

/** Pause or resume the Program: flips the same is_active retire switch
 *  startChapter respects (ADR-865). Paused: the Channel page is hidden and no
 *  new Chapters can start; members and Chapters keep everything they have. */
export async function setChannelProgramPausedAction(
  channelId: string,
  idOrSlug: string,
  paused: boolean,
  _formData: FormData,
): Promise<void> {
  const profileId = await authorizeChannelManager(channelId)
  if (!profileId) redirect(`${managePath(idOrSlug)}?section=program&error=denied`)

  try {
    await setProgramPausedForStaff({ channelId, profileId, paused })
  } catch {
    redirect(`${managePath(idOrSlug)}?section=program&error=failed`)
  }
  revalidateManage(idOrSlug)
  redirect(`${managePath(idOrSlug)}?section=program&saved=1`)
}

/** Re-snapshot the blueprint from any live, real circle. Existing Chapters
 *  keep the setup they started with; only future Chapters see the new one. */
export async function refreshChannelProgramBlueprintAction(
  channelId: string,
  idOrSlug: string,
  formData: FormData,
): Promise<void> {
  const profileId = await authorizeChannelManager(channelId)
  if (!profileId) redirect(`${managePath(idOrSlug)}?section=program&error=denied`)

  const sourceCircleId = String(formData.get('sourceCircleId') ?? '').trim()
  if (!sourceCircleId) redirect(`${managePath(idOrSlug)}?section=program&error=missing`)

  try {
    await refreshProgramBlueprintForStaff({ channelId, profileId, sourceCircleId })
  } catch {
    redirect(`${managePath(idOrSlug)}?section=program&error=failed`)
  }
  revalidateManage(idOrSlug)
  redirect(`${managePath(idOrSlug)}?section=program&saved=1`)
}

/** Detach the blueprint: the channel goes back to a plain focus area. The
 *  blueprint row is soft-retired (never deleted), and existing Chapters keep
 *  everything they have. */
export async function detachChannelProgramAction(
  channelId: string,
  idOrSlug: string,
  _formData: FormData,
): Promise<void> {
  const profileId = await authorizeChannelManager(channelId)
  if (!profileId) redirect(`${managePath(idOrSlug)}?section=program&error=denied`)

  try {
    await detachProgramBlueprint({ channelId, profileId })
  } catch {
    redirect(`${managePath(idOrSlug)}?section=program&error=failed`)
  }
  revalidateManage(idOrSlug)
  redirect(`${managePath(idOrSlug)}?section=program&saved=1`)
}
