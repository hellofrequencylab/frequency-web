'use server'

// THE CLIENT-CALLABLE SERVER ACTIONS for reusable email templates (ADR-380). A 'use server' module may
// export ONLY async functions, so the pure validation helpers + the shared types live in
// lib/spaces/email-templates.ts. This thin file is the seam the CLIENT surfaces import (the composer's
// template picker), so the mutations cross the network boundary as proper Server Actions. The
// authorization + validation all live in the implementations; these wrappers just re-expose them and
// revalidate the email surface so the template list reflects the change.

import { revalidatePath } from 'next/cache'
import {
  createSpaceEmailTemplate as createSpaceEmailTemplateImpl,
  updateSpaceEmailTemplate as updateSpaceEmailTemplateImpl,
  deleteSpaceEmailTemplate as deleteSpaceEmailTemplateImpl,
} from '@/lib/spaces/email-templates'
import { type ActionResult } from '@/lib/action-result'

// The Space email surface lives at /spaces/<slug>/settings/email. We revalidate it so the saved-template
// list in the picker reflects a create / update / delete.
function revalidateEmail(slug: string) {
  revalidatePath(`/spaces/${slug}/settings/email`)
}

/** Save the current draft as a named template. Gated on canEditProfile (see the implementation). */
export async function createSpaceEmailTemplate(
  spaceId: string,
  slug: string,
  name: string,
  subject: string,
  body: string,
): Promise<ActionResult<{ id: string }>> {
  const res = await createSpaceEmailTemplateImpl(spaceId, name, subject, body)
  if (!('error' in res)) revalidateEmail(slug)
  return res
}

/**
 * Re-save a template's name, subject and body. Gated on canEditProfile AND the template belonging to
 * the Space (see the implementation). 2026-09-05 (scan2 L9-08): updateSpaceEmailTemplate had no
 * importer, so tweaking a saved template meant delete and recreate. The picker calls this with the
 * composer's current subject + body, so "update" means "make the template say what I have written".
 */
export async function updateSpaceEmailTemplate(
  spaceId: string,
  slug: string,
  id: string,
  name: string,
  subject: string,
  body: string,
): Promise<ActionResult> {
  const res = await updateSpaceEmailTemplateImpl(spaceId, id, name, subject, body)
  if (!('error' in res)) revalidateEmail(slug)
  return res
}

/** Delete a template. Gated on canEditProfile (see the implementation). */
export async function deleteSpaceEmailTemplate(
  spaceId: string,
  slug: string,
  id: string,
): Promise<ActionResult> {
  const res = await deleteSpaceEmailTemplateImpl(spaceId, id)
  if (!('error' in res)) revalidateEmail(slug)
  return res
}
