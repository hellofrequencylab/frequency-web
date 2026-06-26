'use server'

// Server actions for the Starter Circle BUILDER: the four entry paths (Vera
// spark / blank / outline upload), autosave, and the apply-to-draft Vera moves
// (compose a section, edit by instruction). Thin authz wrappers over
// lib/circles/draft.ts + the Vera set; the heavy lifting lives there. Mirrors
// app/(main)/circles/remix-actions.ts (the callerProfileId real-member guard)
// and app/(main)/journeys/create-actions.ts (extractOverviewAction).

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { PillarSlug } from '@/lib/pillars'
import {
  createBlankCircleDraft,
  getCircleDraft,
  saveCircleDraft,
  type CircleDraft,
  type CircleDraftPatch,
} from '@/lib/circles/draft'
import { assertCanCreate } from '@/lib/core/load-capabilities'
import { draftCircleSpark, type CircleSparkDraft } from '@/lib/ai/circle-spark'
import {
  composeCircleSection,
  type CircleComposeSection,
  type CircleComposeContext,
  type CircleComposeResult,
} from '@/lib/ai/circle-compose'
import { planCircleEdit, type CircleForEdit, type CircleEditPatch } from '@/lib/ai/circle-edit'
import { extractOverviewText } from '@/lib/journeys/extract-text'

/** The signed-in REAL member's profile id. Demo profiles cannot build a Circle
 *  (mirrors the remix/claim guard). */
async function callerProfileId(): Promise<string> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Please sign in to build a Circle.')
  const admin = createAdminClient()
  const { data } = await admin.from('profiles').select('id, is_demo').eq('auth_user_id', user.id).maybeSingle()
  const me = data as { id: string; is_demo?: boolean } | null
  if (!me || me.is_demo) throw new Error('Only real members can build a Circle.')
  return me.id
}

/** Load a draft and assert the caller is its Host. Returns the draft. */
async function hostedDraft(circleId: string, profileId: string): Promise<CircleDraft> {
  const draft = await getCircleDraft(circleId)
  if (!draft) throw new Error('Circle not found.')
  if (draft.hostId !== profileId) throw new Error('Only the Host can edit this Circle.')
  return draft
}

/** Vera drafts the whole Circle frame from a few answers or a pasted outline.
 *  No DB write — the wizard reviews the draft before committing it. Null when
 *  Vera is offline (the wizard then lets them type it by hand). */
export async function sparkPreviewAction(input: {
  topic: string
  who: string
  primaryPillar: PillarSlug | null
  cadence?: string
  sourceText?: string
}): Promise<CircleSparkDraft | null> {
  const profileId = await callerProfileId()
  return draftCircleSpark({
    topic: input.topic,
    who: input.who,
    primaryPillar: input.primaryPillar,
    cadence: input.cadence,
    sourceText: input.sourceText,
    profileId,
  })
}

/** Commit a reviewed spark into a private draft the caller owns, then route the
 *  caller into the builder. */
export async function createDraftFromSparkAction(spark: CircleSparkDraft): Promise<{ slug: string; circleId: string }> {
  const profileId = await callerProfileId()
  await assertCanCreate('circle.create')
  const res = await createBlankCircleDraft({ profileId, spark })
  revalidatePath('/circles')
  revalidatePath('/lead')
  return res
}

/** Start a blank draft from scratch (the "I'll write it myself" path). */
export async function createBlankDraftAction(input?: { name?: string }): Promise<{ slug: string; circleId: string }> {
  const profileId = await callerProfileId()
  await assertCanCreate('circle.create')
  const res = await createBlankCircleDraft({ profileId, name: input?.name })
  revalidatePath('/circles')
  revalidatePath('/lead')
  return res
}

/** Pull plain text out of an uploaded write-up (PDF / Word / plain text) so the
 *  builder can hand it to the spark. Mirrors extractOverviewAction. */
export async function extractOutlineAction(formData: FormData): Promise<{ text: string }> {
  await callerProfileId()
  const file = formData.get('file')
  if (!(file instanceof File)) throw new Error('No file to read.')
  if (file.size > 5 * 1024 * 1024) throw new Error('That file is over 5 MB. Trim it or paste the text instead.')
  try {
    const buf = Buffer.from(await file.arrayBuffer())
    const text = await extractOverviewText(buf, file.type, file.name)
    if (!text) throw new Error("Couldn't read any text from that file. Try plain text, or paste it instead.")
    return { text: text.slice(0, 20000) }
  } catch (e) {
    throw e instanceof Error ? e : new Error("Couldn't read that file. Try plain text, or paste the outline instead.")
  }
}

/** Autosave: write a patch to the draft. Host-gated. */
export async function saveCircleDraftAction(circleId: string, patch: CircleDraftPatch): Promise<{ ok: true }> {
  const profileId = await callerProfileId()
  const draft = await hostedDraft(circleId, profileId)
  await saveCircleDraft(circleId, patch)
  revalidatePath(`/circles/${draft.slug}/edit`)
  return { ok: true }
}

/** Vera composes ONE section grounded in the draft so far. Host-gated. Does NOT
 *  write — the client merges the returned partial and autosaves. Null when Vera
 *  is offline. */
export async function composeSectionAction(input: {
  circleId: string
  section: CircleComposeSection
}): Promise<CircleComposeResult | null> {
  const profileId = await callerProfileId()
  const draft = await hostedDraft(input.circleId, profileId)
  const context: CircleComposeContext = {
    name: draft.name,
    primaryPillar: draft.primaryPillar,
    topic: draft.about ?? undefined,
    audience: draft.sizeLabel ?? undefined,
    identity: draft.about ?? undefined,
  }
  return composeCircleSection({ section: input.section, context, profileId })
}

/** Vera applies a plain-language change to the draft. Host-gated. Loads the
 *  draft, asks Vera for the smallest patch, applies it, and returns the fresh
 *  draft. Null when Vera is offline or returns no change. */
export async function editDraftAction(input: {
  circleId: string
  request: string
}): Promise<{ draft: CircleDraft } | null> {
  const profileId = await callerProfileId()
  const draft = await hostedDraft(input.circleId, profileId)

  // Vera reads flat spark-shaped fields (meetup/gathering/thread/format as plain
  // strings); the draft keeps meetup/gathering as { text } rhythm beats, so pass
  // their text in and lift the patch's strings back into rhythm beats on the way out.
  const forEdit: CircleForEdit = {
    name: draft.name,
    card: draft.about ?? undefined,
    identity: draft.about ?? undefined,
    pillarsInside: draft.pillarsInside,
    meetup: draft.meetup.text || undefined,
    gathering: draft.gathering.text || undefined,
    thread: draft.thread ?? undefined,
    format: draft.format ?? undefined,
    sizeLabel: draft.sizeLabel ?? undefined,
    agreements: draft.agreements,
    remixOptions: draft.remixOptions,
  }
  const patch = await planCircleEdit({ request: input.request, circle: forEdit, profileId })
  if (!patch) return null

  const draftPatch = editPatchToDraftPatch(patch, draft)
  if (Object.keys(draftPatch).length) await saveCircleDraft(input.circleId, draftPatch)

  const fresh = await getCircleDraft(input.circleId)
  return fresh ? { draft: fresh } : null
}

/** Map Vera's spark-shaped edit patch onto the draft's storage shape: the two
 *  rhythm beats become { text }, carrying the draft's existing length. Drops the
 *  fields a draft does not persist (card/one_liner/identity/audience live on the
 *  `circles` row's name/about, set elsewhere). */
function editPatchToDraftPatch(patch: CircleEditPatch, draft: CircleDraft): CircleDraftPatch {
  const out: CircleDraftPatch = {}
  if (patch.name !== undefined) out.name = patch.name
  if (patch.pillarsInside !== undefined) out.pillarsInside = patch.pillarsInside
  if (patch.meetup !== undefined) out.meetup = { text: patch.meetup, length: draft.meetup.length }
  if (patch.gathering !== undefined) out.gathering = { text: patch.gathering, length: draft.gathering.length }
  if (patch.thread !== undefined) out.thread = patch.thread
  if (patch.format !== undefined) out.format = patch.format
  if (patch.sizeLabel !== undefined) out.sizeLabel = patch.sizeLabel
  if (patch.agreements !== undefined) out.agreements = patch.agreements
  if (patch.remixOptions !== undefined) out.remixOptions = patch.remixOptions
  return out
}
