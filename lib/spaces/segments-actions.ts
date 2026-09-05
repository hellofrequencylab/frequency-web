'use server'

// THE CLIENT-CALLABLE SERVER ACTIONS for saved audience segments (ADR-380). A 'use server' module may
// export ONLY async functions, so the pure validation helpers + the shared types live in
// lib/spaces/segments.ts (no directive: pure helpers + IO + the action implementations + types). This
// thin file is the seam the CLIENT surfaces import (the audience picker's segment management), so the
// mutations cross the network boundary as proper Server Actions. The authorization + validation all
// live in the implementations; these wrappers just re-expose them and revalidate the email surface so
// the segment list reflects the change.

import { revalidatePath } from 'next/cache'
import {
  createSpaceSegment as createSpaceSegmentImpl,
  updateSpaceSegment as updateSpaceSegmentImpl,
  deleteSpaceSegment as deleteSpaceSegmentImpl,
  listSpaceSegments,
} from '@/lib/spaces/segments'
import type { AudienceFilter } from '@/lib/spaces/audiences'
import { fail, type ActionResult } from '@/lib/action-result'

// The Space email surface lives at /spaces/<slug>/settings/email. We revalidate it so the saved-segment
// list in the picker reflects a create / update / delete.
function revalidateEmail(slug: string) {
  revalidatePath(`/spaces/${slug}/settings/email`)
}

/** Save the current filter as a named segment. Gated on canEditProfile (see the implementation). */
export async function createSpaceSegment(
  spaceId: string,
  slug: string,
  name: string,
  definition: AudienceFilter,
): Promise<ActionResult<{ id: string }>> {
  const res = await createSpaceSegmentImpl(spaceId, name, definition)
  if (!('error' in res)) revalidateEmail(slug)
  return res
}

/**
 * Rename a saved segment, keeping its stored definition. Gated on canEditProfile AND the segment
 * belonging to the Space (see the implementation). 2026-09-05 (scan2 L9-08): updateSpaceSegment had
 * no importer, so a mistyped name meant delete and recreate (and re-point every automation). The
 * picker only knows a saved segment by id + name, so the definition is re-read here, space-scoped,
 * rather than trusted from the client; pass `definition` to redefine as well as rename.
 */
export async function updateSpaceSegment(
  spaceId: string,
  slug: string,
  id: string,
  name: string,
  definition?: AudienceFilter,
): Promise<ActionResult> {
  let next = definition
  if (!next) {
    const existing = (await listSpaceSegments(spaceId)).find((s) => s.id === id)
    if (!existing) return fail('Segment not found.')
    next = existing.definition
  }
  const res = await updateSpaceSegmentImpl(spaceId, id, name, next)
  if (!('error' in res)) revalidateEmail(slug)
  return res
}

/** Delete a segment. Gated on canEditProfile (see the implementation). */
export async function deleteSpaceSegment(
  spaceId: string,
  slug: string,
  id: string,
): Promise<ActionResult> {
  const res = await deleteSpaceSegmentImpl(spaceId, id)
  if (!('error' in res)) revalidateEmail(slug)
  return res
}
