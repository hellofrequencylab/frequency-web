'use server'

// Airwaves P1 — the Recordings library console actions (ADR-608 §6b/§6c). Slug-scoped server actions the
// owner console calls: upload a file into the Loom + create the Recording, edit a Recording's metadata, and
// delete one. Every action resolves the caller in THIS layer (getCallerProfile — importing lib/auth is fine
// here, it never reaches lib/spaces/store) and passes the actor id into the gated lib/airwaves seam, which
// re-authorizes on the owning Space (canEditProfile). Money stays OFF: P1 Recordings are FREE ({mode:'free'}).

import { revalidatePath } from 'next/cache'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { classifyLoomUpload } from '@/lib/library/upload-kinds'
import { uploadToLoom } from '@/lib/page-editor/loom-field-actions'
import {
  createRecording,
  updateRecording,
  deleteRecording,
  type UpdateRecordingInput,
} from '@/lib/airwaves/recordings'
import {
  createShow,
  updateShow,
  deleteShow,
  type CreateShowInput,
  type UpdateShowInput,
} from '@/lib/airwaves/shows'
import { searchSpaceLibraryImages, type LibraryImagePick } from '@/lib/library/store'
import type { Recording, RecordingVisibility, Show } from '@/lib/airwaves/types'

type ActionResult<T> = { ok: true; value: T } | { ok: false; error: string }

function consolePath(slug: string): string {
  return `/spaces/${slug}/settings/airwaves`
}

/**
 * Upload an audio/video file and create its Recording in one step. The file rides the widened Loom
 * (uploadToLoom → recordings-media bucket + a library_assets row), then a Recording references it. Gated to
 * Space editors both here (the slug resolve) and inside createRecording (the actor id). A/V only: an image
 * or an unknown type is rejected before any write.
 */
export async function uploadRecordingAction(
  slug: string,
  formData: FormData,
): Promise<ActionResult<Recording>> {
  const caller = await getCallerProfile()
  const viewerProfileId = caller?.id ?? null
  if (!viewerProfileId) return { ok: false, error: 'Sign in to add a recording.' }

  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) return { ok: false, error: 'That space is not available.' }
  const caps = await getSpaceCapabilities(space, viewerProfileId)
  if (!caps.canEditProfile) return { ok: false, error: 'You do not have access to add recordings here.' }

  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: 'Choose an audio or video file.' }
  const target = classifyLoomUpload(file.type)
  if (!target || target.kind === 'image') {
    return { ok: false, error: 'Airwaves takes an audio or video file. Pick one of those.' }
  }
  if (file.size > target.maxBytes) {
    return { ok: false, error: 'That file is too large. The ceiling is 500 MB.' }
  }

  // File it into the Loom (upload + library_assets row, with rollback on a catalog miss). uploadToLoom reads
  // the `file` field and re-authorizes on the same slug, so this is a single trusted path.
  const uploaded = await uploadToLoom(slug, formData)
  if ('error' in uploaded) return { ok: false, error: uploaded.error }

  const titleRaw = formData.get('title')
  const title = (typeof titleRaw === 'string' && titleRaw.trim()) || file.name.replace(/\.[^.]+$/, '')

  const created = await createRecording(viewerProfileId, {
    spaceId: space.id,
    loomAssetId: uploaded.id,
    mediaKind: target.kind, // 'audio' | 'video'
    title,
    price: { mode: 'free' }, // P1: free only (money stays behind payoutsLive()).
    visibility: 'space',
  })
  if (!created.ok) return created
  revalidatePath(consolePath(slug))
  return created
}

/** Edit a Recording's metadata (title / description / visibility / published state). Gated inside
 *  updateRecording on the actor id. */
export async function updateRecordingAction(
  slug: string,
  recordingId: string,
  fields: UpdateRecordingInput,
): Promise<ActionResult<Recording>> {
  const caller = await getCallerProfile()
  const viewerProfileId = caller?.id ?? null
  if (!viewerProfileId) return { ok: false, error: 'Sign in to edit a recording.' }
  const res = await updateRecording(viewerProfileId, recordingId, fields)
  if (res.ok) revalidatePath(consolePath(slug))
  return res
}

/** Set a Recording's visibility (a focused convenience over updateRecordingAction). */
export async function setRecordingVisibilityAction(
  slug: string,
  recordingId: string,
  visibility: RecordingVisibility,
): Promise<ActionResult<Recording>> {
  return updateRecordingAction(slug, recordingId, { visibility })
}

/** Delete a Recording (its attachments cascade; the Loom file is left in place). */
export async function deleteRecordingAction(
  slug: string,
  recordingId: string,
): Promise<ActionResult<{ id: string }>> {
  const caller = await getCallerProfile()
  const viewerProfileId = caller?.id ?? null
  if (!viewerProfileId) return { ok: false, error: 'Sign in to remove a recording.' }
  const res = await deleteRecording(viewerProfileId, recordingId)
  if (res.ok) revalidatePath(consolePath(slug))
  return res
}

// ── Airwaves P3 — Shows (podcast feeds) ────────────────────────────────────────────────────────────
// A Show groups Recordings into one RSS feed; an Episode is a Recording with its show_id set. These
// wrappers resolve the caller the SAME way the Recordings actions do (getCallerProfile), then hand the
// actor id to the gated lib/airwaves/shows seam, which re-authorizes on the owning Space (owner / admin /
// editor). Episode moves (assign / reorder / publish) are plain Recording edits, so they route through
// updateRecordingAction. The console path is revalidated on every write.

/** The Show fields the console form supplies. `spaceId` is resolved server-side from the slug, never
 *  trusted from the client. */
export type ShowFormInput = Omit<CreateShowInput, 'spaceId'>

/** Create a Show for the slug's Space. Gated here (the slug resolve) and again inside createShow (the
 *  actor id). Draft by default unless the form flips status to 'published'. */
export async function createShowAction(
  slug: string,
  input: ShowFormInput,
): Promise<ActionResult<Show>> {
  const caller = await getCallerProfile()
  const viewerProfileId = caller?.id ?? null
  if (!viewerProfileId) return { ok: false, error: 'Sign in to add a show.' }

  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) return { ok: false, error: 'That space is not available.' }
  const caps = await getSpaceCapabilities(space, viewerProfileId)
  if (!caps.canEditProfile) return { ok: false, error: 'You do not have access to add a show here.' }

  const res = await createShow(viewerProfileId, { ...input, spaceId: space.id })
  if (res.ok) revalidatePath(consolePath(slug))
  return res
}

/** Edit a Show's metadata (title / description / category / cover / status …). Gated inside updateShow
 *  on the actor id + the Show's owning Space. */
export async function updateShowAction(
  slug: string,
  showId: string,
  fields: UpdateShowInput,
): Promise<ActionResult<Show>> {
  const caller = await getCallerProfile()
  const viewerProfileId = caller?.id ?? null
  if (!viewerProfileId) return { ok: false, error: 'Sign in to edit a show.' }
  const res = await updateShow(viewerProfileId, showId, fields)
  if (res.ok) revalidatePath(consolePath(slug))
  return res
}

/** Delete a Show. The lib unlinks its episodes (clears show_id) before removing the Show, so media is
 *  never destroyed. Gated inside deleteShow on the actor id. */
export async function deleteShowAction(
  slug: string,
  showId: string,
): Promise<ActionResult<{ id: string }>> {
  const caller = await getCallerProfile()
  const viewerProfileId = caller?.id ?? null
  if (!viewerProfileId) return { ok: false, error: 'Sign in to delete a show.' }
  const res = await deleteShow(viewerProfileId, showId)
  if (res.ok) revalidatePath(consolePath(slug))
  return res
}

/** Assign a Recording to a Show (or clear it with null), making it an Episode. A plain Recording edit. */
export async function assignEpisodeAction(
  slug: string,
  recordingId: string,
  showId: string | null,
): Promise<ActionResult<Recording>> {
  return updateRecordingAction(slug, recordingId, { showId })
}

/** Set an Episode's order within its Show (lower sorts first in the feed). A plain Recording edit. */
export async function reorderEpisodeAction(
  slug: string,
  recordingId: string,
  sortOrder: number,
): Promise<ActionResult<Recording>> {
  return updateRecordingAction(slug, recordingId, { sortOrder })
}

/** Set an Episode's public-feed state: its visibility and published date. An Episode only rides the
 *  public feed when visibility is 'public' AND publishedAt is set to a past instant. A plain Recording
 *  edit. */
export async function setEpisodePublishAction(
  slug: string,
  recordingId: string,
  fields: { visibility: RecordingVisibility; publishedAt: string | null },
): Promise<ActionResult<Recording>> {
  return updateRecordingAction(slug, recordingId, fields)
}

/** The Loom images a Show owner may reuse as cover art (their Space's own images plus the shared/public
 *  library), gated on edit permission for the Space. Returns the picks (id = library_assets id, stored
 *  as the Show's coverAssetId). FAIL-SAFE to [] on any miss. */
export async function listShowCoverImagesAction(
  slug: string,
  query?: string,
): Promise<LibraryImagePick[]> {
  const caller = await getCallerProfile()
  const viewerProfileId = caller?.id ?? null
  if (!viewerProfileId) return []
  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) return []
  const caps = await getSpaceCapabilities(space, viewerProfileId)
  if (!caps.canEditProfile) return []
  return searchSpaceLibraryImages(space.id, query)
}
