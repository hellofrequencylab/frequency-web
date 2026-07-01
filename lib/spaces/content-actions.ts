'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCallerProfile, getMyProfileId } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { type ActionResult, ok, fail } from '@/lib/action-result'

// SPACE CONTENT write actions (Puck content blocks, Phase 2, ADR-476/472). The operator authors
// brand Updates + FAQ; a member submits a review. Mirrors the edit-page actions posture exactly:
// EVERY action RE-RESOLVES the Space from the slug and RE-GATES server-side, so the route/UI gate is
// only UX and this is the authority. Writes go through the service-role admin client (RLS bypass), so
// the gate MUST be enforced here in app code. Reactions + comments on an Update are NOT handled here:
// they reuse the existing feed system (toggleReaction / createReply) against the Update's anchor post.
//
// The space_* tables are not in the generated DB types yet (ADR-246), so the admin client is reached
// untyped per-write (the same seam the edit-page actions use for spaces.preferences).

// ── Untyped admin seams (ADR-246) ────────────────────────────────────────────────────────────────
type Row = Record<string, unknown>
type InsertResult = { data: { id: string } | null; error: unknown }

function db() {
  return createAdminClient() as unknown as {
    from: (t: string) => {
      insert: (v: Row) => { select: (c: string) => { single: () => Promise<InsertResult> } }
      update: (v: Row) => { eq: (c: string, val: string) => { eq: (c: string, val: string) => Promise<{ error: unknown }> } }
      delete: () => { eq: (c: string, val: string) => { eq: (c: string, val: string) => Promise<{ error: unknown }> } }
      upsert: (v: Row, opts: { onConflict: string }) => Promise<{ error: unknown }>
    }
  }
}

/** Authorize the caller as an EDITOR (owner / admin / editor) of `slug`'s Space; returns the Space id
 *  and the caller's profile id, or null on any miss. Mirrors the edit-page authorizeEditor gate. */
async function authorizeEditor(slug: string): Promise<{ spaceId: string; profileId: string } | null> {
  const profileId = await getMyProfileId()
  if (!profileId) return null
  const space = await getVisibleSpaceBySlug(slug, profileId)
  if (!space) return null
  const caps = await getSpaceCapabilities(space, profileId)
  if (!caps.canEditProfile) return null // owner / admin / editor (the write authority)
  return { spaceId: space.id, profileId }
}

function revalidateLanding(slug: string) {
  revalidatePath(`/spaces/${slug}`)
  revalidatePath(`/spaces/${slug}/edit-page`)
}

// ── Brand Updates (operator-gated) ─────────────────────────────────────────────────────────────

export interface UpdateInput {
  title: string
  body: string
  imageUrl?: string | null
  /** Publish immediately (default) or save as a draft. */
  publish?: boolean
}

/** Create a brand Update on a Space. Owner/admin/editor-gated. Publishes immediately unless
 *  `publish` is false, stamping published_at. Returns the new id. */
export async function createSpaceUpdate(slug: string, input: UpdateInput): Promise<ActionResult<{ id: string }>> {
  const auth = await authorizeEditor(slug)
  if (!auth) return fail('You do not have access to edit this page.')

  const title = input.title.trim().slice(0, 200)
  const body = input.body.trim().slice(0, 20000)
  if (!title && !body) return fail('Add a title or some words first.')

  const publish = input.publish !== false
  const { data, error } = await db()
    .from('space_updates')
    .insert({
      space_id: auth.spaceId,
      author_profile_id: auth.profileId,
      title,
      body,
      image_url: input.imageUrl?.trim() || null,
      status: publish ? 'published' : 'draft',
      published_at: publish ? new Date().toISOString() : null,
    })
    .select('id')
    .single()
  if (error || !data) return fail('Could not post that update. Try again.')

  revalidateLanding(slug)
  return ok({ id: data.id })
}

/** Edit a brand Update. Owner/admin/editor-gated (double-scoped: the update must belong to the
 *  authorized Space, enforced by the second .eq on space_id). */
export async function updateSpaceUpdate(
  slug: string,
  id: string,
  input: Partial<UpdateInput>,
): Promise<ActionResult> {
  const auth = await authorizeEditor(slug)
  if (!auth) return fail('You do not have access to edit this page.')

  const patch: Row = { updated_at: new Date().toISOString() }
  if (typeof input.title === 'string') patch.title = input.title.trim().slice(0, 200)
  if (typeof input.body === 'string') patch.body = input.body.trim().slice(0, 20000)
  if (input.imageUrl !== undefined) patch.image_url = input.imageUrl?.trim() || null
  if (input.publish !== undefined) {
    patch.status = input.publish ? 'published' : 'draft'
    if (input.publish) patch.published_at = new Date().toISOString()
  }

  const { error } = await db().from('space_updates').update(patch).eq('id', id).eq('space_id', auth.spaceId)
  if (error) return fail('Could not save that update. Try again.')

  revalidateLanding(slug)
  return ok()
}

/** Delete a brand Update. Owner/admin/editor-gated + space-scoped. */
export async function deleteSpaceUpdate(slug: string, id: string): Promise<ActionResult> {
  const auth = await authorizeEditor(slug)
  if (!auth) return fail('You do not have access to edit this page.')

  const { error } = await db().from('space_updates').delete().eq('id', id).eq('space_id', auth.spaceId)
  if (error) return fail('Could not remove that update. Try again.')

  revalidateLanding(slug)
  return ok()
}

// ── FAQ (operator-gated) ─────────────────────────────────────────────────────────────────────────

export interface FaqInput {
  question: string
  answer: string
  position?: number
}

/** Create a FAQ entry. Owner/admin/editor-gated. */
export async function createSpaceFaq(slug: string, input: FaqInput): Promise<ActionResult<{ id: string }>> {
  const auth = await authorizeEditor(slug)
  if (!auth) return fail('You do not have access to edit this page.')

  const question = input.question.trim().slice(0, 500)
  const answer = input.answer.trim().slice(0, 5000)
  if (!question) return fail('Add a question first.')

  const { data, error } = await db()
    .from('space_faqs')
    .insert({
      space_id: auth.spaceId,
      question,
      answer,
      position: Number.isFinite(input.position) ? Math.trunc(input.position as number) : 0,
    })
    .select('id')
    .single()
  if (error || !data) return fail('Could not add that question. Try again.')

  revalidateLanding(slug)
  return ok({ id: data.id })
}

/** Edit a FAQ entry. Owner/admin/editor-gated + space-scoped. */
export async function updateSpaceFaq(
  slug: string,
  id: string,
  input: Partial<FaqInput>,
): Promise<ActionResult> {
  const auth = await authorizeEditor(slug)
  if (!auth) return fail('You do not have access to edit this page.')

  const patch: Row = { updated_at: new Date().toISOString() }
  if (typeof input.question === 'string') patch.question = input.question.trim().slice(0, 500)
  if (typeof input.answer === 'string') patch.answer = input.answer.trim().slice(0, 5000)
  if (input.position !== undefined && Number.isFinite(input.position)) patch.position = Math.trunc(input.position)

  const { error } = await db().from('space_faqs').update(patch).eq('id', id).eq('space_id', auth.spaceId)
  if (error) return fail('Could not save that question. Try again.')

  revalidateLanding(slug)
  return ok()
}

/** Delete a FAQ entry. Owner/admin/editor-gated + space-scoped. */
export async function deleteSpaceFaq(slug: string, id: string): Promise<ActionResult> {
  const auth = await authorizeEditor(slug)
  if (!auth) return fail('You do not have access to edit this page.')

  const { error } = await db().from('space_faqs').delete().eq('id', id).eq('space_id', auth.spaceId)
  if (error) return fail('Could not remove that question. Try again.')

  revalidateLanding(slug)
  return ok()
}

// ── Reviews (member-gated: signed-in member, author = caller, NOT the owner) ──────────────────────

export interface ReviewInput {
  rating: number
  body: string
}

/**
 * Submit (or re-submit) a member review of a Space. Gated: the caller must be a SIGNED-IN member,
 * the review is attributed to THEM (author = caller, never forgeable), and the Space OWNER cannot
 * review their own Space (no seeding your own proof). Upserts on (space_id, author_profile_id) so a
 * member has exactly one review they can revise. Returns ActionResult.
 */
export async function submitSpaceReview(slug: string, input: ReviewInput): Promise<ActionResult> {
  const caller = await getCallerProfile()
  const profileId = caller?.id ?? null
  if (!profileId) return fail('Sign in to leave a review.')

  const space = await getVisibleSpaceBySlug(slug, profileId)
  if (!space) return fail('That space is not available.')

  // The owner cannot review their own Space (the deliverable: a member, not the owner).
  if (space.ownerProfileId && space.ownerProfileId === profileId) {
    return fail('You cannot review a space you run.')
  }

  const rating = Math.trunc(input.rating)
  if (!(rating >= 1 && rating <= 5)) return fail('Pick a rating from 1 to 5.')
  const body = input.body.trim().slice(0, 2000)

  const { error } = await db()
    .from('space_reviews')
    .upsert(
      {
        space_id: space.id,
        author_profile_id: profileId,
        rating,
        body,
        status: 'visible',
      },
      { onConflict: 'space_id,author_profile_id' },
    )
  if (error) return fail('Could not save your review. Try again.')

  revalidateLanding(slug)
  return ok()
}

/** Hide a review (operator moderation). Owner/admin/editor-gated + space-scoped. Sets status hidden
 *  rather than deleting, so a mistaken hide is reversible. */
export async function hideSpaceReview(slug: string, id: string): Promise<ActionResult> {
  const auth = await authorizeEditor(slug)
  if (!auth) return fail('You do not have access to moderate this page.')

  const { error } = await db()
    .from('space_reviews')
    .update({ status: 'hidden' })
    .eq('id', id)
    .eq('space_id', auth.spaceId)
  if (error) return fail('Could not hide that review. Try again.')

  revalidateLanding(slug)
  return ok()
}
