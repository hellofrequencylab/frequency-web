'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCallerProfile, getMyProfileId } from '@/lib/auth'
import { getVisibleSpaceBySlug, getSpaceById } from '@/lib/spaces/store'
import { spaceFunctionDef, spaceFunctionEnabled } from '@/lib/spaces/functions'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { listSpaceFollowerIds } from '@/lib/spaces/follows'
import { type ActionResult, ok, fail } from '@/lib/action-result'

// SPACE CONTENT write actions (Puck content blocks, Phase 2, ADR-476/472). The operator authors
// brand Updates + FAQ; a member submits a review. Mirrors the edit-page actions posture exactly:
// EVERY action RE-RESOLVES the Space from the slug and RE-GATES server-side, so the route/UI gate is
// only UX and this is the authority. Writes go through the service-role admin client (RLS bypass), so
// the gate MUST be enforced here in app code.
//
// The Space Communities wall actions (member posts, reactions, comments, pin/remove moderation) were
// removed in C3.4 (ADR-1091, LIVE-059): a Space's community is its Circles (ADR-1013 §3). The brand
// Updates actions below stay — they back the SpaceUpdates page-editor block, a separate feature. The
// is_space_update_post RLS arms the wall relied on were narrowed out in C3.5
// (20270317000000_narrow_space_update_rls_arms.sql): these writes ride the admin client either way.
//
// The space_* tables are not in the generated DB types yet (ADR-246), so the admin client is reached
// untyped per-write (the same seam the edit-page actions use for spaces.preferences).

// ── Untyped admin seams (ADR-246) ────────────────────────────────────────────────────────────────
// The space_* tables + the Update anchor path reach public.posts, none of which the space content
// actions have generated types for here, so the admin client is used through a permissive builder
// shape. Each call site keeps its own precise result cast.
type Row = Record<string, unknown>

/* eslint-disable @typescript-eslint/no-explicit-any */
function db(): { from: (t: string) => any } {
  return createAdminClient() as unknown as { from: (t: string) => any }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

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
  // The operator's OWN editor surface. Omitting it meant a write revalidated every public
  // surface except the page the operator was standing on.
  revalidatePath(`/spaces/${slug}/settings/basics`)
}

/** Notify a Space's FOLLOWERS that the business posted a new Update (Phase 3). One batched insert into
 *  notifications (type 'space_update'; the href resolver lands a slug-referenced Space on its root,
 *  ADR-1091 C3.2). Best-effort + bounded; a failure never blocks the post. The actor (the poster) is
 *  excluded. */
async function fanOutNewSpacePost(spaceId: string, slug: string, actorId: string): Promise<void> {
  try {
    const space = await getSpaceById(spaceId)
    const brand = space?.brandName ?? space?.name ?? 'A space you follow'
    const followerIds = (await listSpaceFollowerIds(spaceId)).filter((id) => id !== actorId).slice(0, 5000)
    if (followerIds.length === 0) return
    const rows = followerIds.map((id) => ({
      recipient_id: id,
      actor_id: actorId,
      type: 'space_update',
      reference_type: 'space',
      reference_id: slug,
      body: `${brand} posted an update`,
    }))
    await db().from('notifications').insert(rows)
  } catch {
    // best-effort: a fan-out miss never fails the post.
  }
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

  // Create the interaction ANCHOR post so members can react + comment on this Update through the
  // existing reactions/comments tables. The anchor is a public.posts row with post_type =
  // 'space_update' (which the member-interaction RLS in 20260918000300 keys off), scoped to the
  // Space id and public. Best-effort: if the anchor fails, the Update still exists (interaction is
  // simply unavailable until an anchor is created), so the write is never lost.
  const anchorId = await ensureUpdateAnchor(auth.spaceId, auth.profileId, data.id, `${title}\n\n${body}`.trim())
  if (anchorId) {
    await db().from('space_updates').update({ post_id: anchorId }).eq('id', data.id).eq('space_id', auth.spaceId)
  }

  // Notify followers of a newly PUBLISHED Update (Phase 3). Best-effort; never blocks the post.
  if (publish) await fanOutNewSpacePost(auth.spaceId, slug, auth.profileId)

  revalidateLanding(slug)
  return ok({ id: data.id })
}

/** Create (idempotently) the interaction ANCHOR public.posts row for a Space Update and return its
 *  id, or null on failure. The anchor carries post_type = 'space_update' (the value the
 *  member-interaction RLS keys off), scope_id = the Space id, visibility public. Best-effort: any
 *  error returns null so the Update write is never blocked on the anchor. */
async function ensureUpdateAnchor(
  spaceId: string,
  authorProfileId: string,
  updateId: string,
  body: string,
): Promise<string | null> {
  try {
    const { data, error } = await db()
      .from('posts')
      .insert({
        author_id: authorProfileId,
        body: body.slice(0, 20000),
        scope_id: spaceId,
        visibility: 'public',
        post_type: 'space_update',
      })
      .select('id')
      .single()
    if (error || !data) return null
    return (data as { id: string }).id
  } catch {
    return null
  }
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

  const { data: saved, error } = await db()
    .from('space_updates')
    .update(patch)
    .eq('id', id)
    .eq('space_id', auth.spaceId)
    .select('post_id, title, body')
    .maybeSingle()
  if (error) return fail('Could not save that update. Try again.')

  // KEEP THE ANCHOR IN STEP. An Update is two rows: the space_updates row that renders, and an
  // anchor public.posts row carrying the reactions and comments (ensureUpdateAnchor, above). Only
  // the first was being patched, so an edited Update showed its new text on the landing page and
  // its OLD text everywhere the anchor renders — with the discussion still attached to wording
  // that no longer existed. Best-effort, exactly like the create path: the edit is already saved
  // and a stale anchor must never fail it.
  const row = saved as { post_id: string | null; title: string | null; body: string | null } | null
  if (row?.post_id) {
    try {
      const anchorBody = `${row.title ?? ''}\n\n${row.body ?? ''}`.trim()
      await db().from('posts').update({ body: anchorBody.slice(0, 20000) }).eq('id', row.post_id)
    } catch {
      // Ignore: the Update is saved. A stale anchor body is cosmetic next to losing the edit.
    }
  }

  revalidateLanding(slug)
  return ok()
}

/** Delete a brand Update. Owner/admin/editor-gated + space-scoped. Removes the interaction anchor
 *  with it, so no public post outlives the Update it was about. */
export async function deleteSpaceUpdate(slug: string, id: string): Promise<ActionResult> {
  const auth = await authorizeEditor(slug)
  if (!auth) return fail('You do not have access to edit this page.')

  // Read the anchor BEFORE deleting: space_updates.post_id is the only link to it, and the FK is
  // `on delete set null` in the other direction only — nothing cascades from the Update to the
  // post. Deleting the Update alone left a public posts row with post_type = 'space_update',
  // still visible to the member-interaction RLS, whose subject no longer existed.
  const { data: existing } = await db()
    .from('space_updates')
    .select('post_id')
    .eq('id', id)
    .eq('space_id', auth.spaceId)
    .maybeSingle()

  const { error } = await db().from('space_updates').delete().eq('id', id).eq('space_id', auth.spaceId)
  if (error) return fail('Could not remove that update. Try again.')

  const anchorId = (existing as { post_id: string | null } | null)?.post_id
  if (anchorId) {
    try {
      // posts.parent_id is ON DELETE CASCADE, so this takes the comment thread with it. That is
      // the intended reading: the discussion was about the Update, and leaving it attached to a
      // deleted subject is worse than removing it.
      await db().from('posts').delete().eq('id', anchorId)
    } catch {
      // Ignore: the Update is gone, which is what the operator asked for.
    }
  }

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
  // An answer is required, not optional. An empty one renders a blank accordion panel AND is
  // silently dropped from the FAQPage JSON-LD (the block filters `!qa.a`), so the operator sees
  // a broken row and search engines see nothing -- a failure that reports itself as success.
  if (!answer) return fail('Add an answer too.')

  // APPEND, do not default to 0. `Number.isFinite(undefined)` is false, so every FAQ an operator
  // created would have landed at position 0 -- tied with the first imported row, since the
  // importer seeds 0..n. Combined with the missing tiebreak on the read (fixed in
  // content-data.ts), tied positions meant the public page reordered itself between requests.
  let position: number
  if (Number.isFinite(input.position)) {
    position = Math.trunc(input.position as number)
  } else {
    const { data: last } = await db()
      .from('space_faqs')
      .select('position')
      .eq('space_id', auth.spaceId)
      .order('position', { ascending: false })
      .limit(1)
      .maybeSingle()
    position = last ? Number((last as { position: number }).position) + 1 : 0
  }

  const { data, error } = await db()
    .from('space_faqs')
    .insert({ space_id: auth.spaceId, question, answer, position })
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

  // Re-gate on the reviews FUNCTION being ON (defense in depth): the Reviews tab notFound()s when an
  // operator turns reviews off, but a crafted request would otherwise still upsert here. Match the read
  // gate so the write can never outlive the wall.
  const reviewsDef = spaceFunctionDef('reviews')
  if (reviewsDef && !spaceFunctionEnabled(space, reviewsDef)) return fail('Reviews are turned off for this space.')

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

/** Publish, edit, or clear a Space-admin reply under a member review (Reviews redesign).
 *  Owner/admin/editor-gated + space-scoped (the write is double-bound to the authorized Space id AND
 *  the review id, so it can never touch a review on another Space). A non-empty `body` stamps the
 *  reply + the responder + the timestamp; an EMPTY body clears all three (the "Remove reply" path).
 *  Fail-soft ActionResult. */
export async function respondToSpaceReview(slug: string, reviewId: string, body: string): Promise<ActionResult> {
  const auth = await authorizeEditor(slug)
  if (!auth) return fail('You do not have access to respond on this page.')

  const trimmed = body.trim().slice(0, 2000)
  const patch: Row = trimmed
    ? {
        response_body: trimmed,
        response_author_profile_id: auth.profileId,
        response_at: new Date().toISOString(),
      }
    : { response_body: null, response_author_profile_id: null, response_at: null }

  const { error } = await db()
    .from('space_reviews')
    .update(patch)
    .eq('space_id', auth.spaceId)
    .eq('id', reviewId)
  if (error) return fail('Could not save your reply. Try again.')

  revalidateLanding(slug)
  return ok()
}
