'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCallerProfile, getMyProfileId } from '@/lib/auth'
import { getVisibleSpaceBySlug, getSpaceById } from '@/lib/spaces/store'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { isFollowing } from '@/lib/spaces/follows'
import { isReactionKey } from '@/lib/feed/reactions'
import { type ActionResult, ok, fail } from '@/lib/action-result'

// SPACE CONTENT write actions (Puck content blocks, Phase 2, ADR-476/472). The operator authors
// brand Updates + FAQ; a member submits a review. Mirrors the edit-page actions posture exactly:
// EVERY action RE-RESOLVES the Space from the slug and RE-GATES server-side, so the route/UI gate is
// only UX and this is the authority. Writes go through the service-role admin client (RLS bypass), so
// the gate MUST be enforced here in app code.
//
// INTERACTION ON UPDATES (owner decision 2026-07-01): ANY signed-in member (free members included)
// may react + comment on a Space Update. The community feed's Crew+ gate must NOT apply, so these
// actions do NOT call the feed's toggleReaction / createReply (those carry the crew + circle-scope +
// gamification rules). Instead we REUSE the existing reactions/comments TABLES directly (an Update
// anchors to a public.posts row; reactions ride public.post_reactions, comments ride posts.parent_id),
// gated here at member level and scoped to the Update's own anchor post. The companion migration
// 20260918000300 grants the matching member-level RLS, tightly guarded on post_type = 'space_update'.
//
// The space_* tables are not in the generated DB types yet (ADR-246), so the admin client is reached
// untyped per-write (the same seam the edit-page actions use for spaces.preferences).

// ── Untyped admin seams (ADR-246) ────────────────────────────────────────────────────────────────
// The space_* tables + the space_update interaction path reach public.posts / public.post_reactions,
// none of which the space content actions have generated types for here, so the admin client is used
// through a permissive builder shape. Each call site keeps its own precise result cast.
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

// ── Member interaction on a Space Update (owner decision 2026-07-01) ──────────────────────────────
// ANY signed-in member (free members included) may react + comment on a Space Update. These actions
// gate ONLY on "a real signed-in profile" (get_my_profile_id present) and on the target post
// belonging to a space_update thread, then write directly to the existing post_reactions / posts
// tables through the admin client. They deliberately do NOT call the feed's toggleReaction /
// createReply, which carry the Crew+ + circle-scope + gamification rules the owner said must not
// apply here. The community feed's own gate is untouched.

/** Walk a post up to its ROOT anchor to confirm it belongs to a space_update thread, and return that
 *  Space's id (the anchor's scope_id) so interaction can be gated on it. Returns null when the post is
 *  missing or does not root at a space_update anchor. Bounded walk (Update threads are 2 levels; capped
 *  at 10 defensively). Mirrors the DB helper is_space_update_post so the app gate and the RLS gate agree. */
async function spaceUpdateThreadSpaceId(postId: string): Promise<string | null> {
  let current: string | null = postId
  for (let i = 0; i < 10 && current; i++) {
    const { data } = await db()
      .from('posts')
      .select('id, parent_id, post_type, scope_id')
      .eq('id', current)
      .maybeSingle()
    const row = data as { id: string; parent_id: string | null; post_type: string; scope_id: string | null } | null
    if (!row) return null
    if (row.post_type === 'space_update') return row.scope_id ?? null
    current = row.parent_id
  }
  return null
}

/** Whether a signed-in member may REACT or COMMENT on this Space's Community feed (owner decision +
 *  2026-07 followers-only rule): a FOLLOWER of the Space, OR an OPERATOR of it (owner / admin / editor,
 *  so the business can always reply on its own wall without following itself). A non-following visitor
 *  is refused at the action layer (the DB RLS is member-level; this narrows it to followers). */
async function canInteractWithSpace(spaceId: string, profileId: string): Promise<boolean> {
  if (await isFollowing(spaceId, profileId)) return true
  const space = await getSpaceById(spaceId)
  if (!space) return false
  const caps = await getSpaceCapabilities(space, profileId)
  return caps.canEditProfile
}

/**
 * Toggle the caller's reaction on a Space Update (or a comment in its thread). Member-gated: a real
 * signed-in profile, and the target must belong to a space_update thread. `activate` is the direction
 * the client applied (true = add, false = remove), so this is ONE idempotent write, mirroring the
 * feed reaction contract WITHOUT its Crew+ gate. `reactionType` must be one of the curated emoji set.
 * Returns { active } so the client can reconcile.
 */
export async function reactToSpaceUpdate(
  postId: string,
  reactionType: string,
  activate: boolean,
): Promise<ActionResult<{ active: boolean }>> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Sign in to react.')
  if (!isReactionKey(reactionType)) return fail('That reaction is not available.')
  const spaceId = await spaceUpdateThreadSpaceId(postId)
  if (!spaceId) return fail('That update is not available.')
  if (!(await canInteractWithSpace(spaceId, profileId))) return fail('Follow this space to join the conversation.')

  if (activate) {
    // Idempotent add: upsert on the (post, profile, reaction) unique key so a double-tap is a no-op.
    const { error } = await db()
      .from('post_reactions')
      .upsert(
        { post_id: postId, profile_id: profileId, reaction_type: reactionType },
        { onConflict: 'post_id,profile_id,reaction_type' },
      )
    if (error) return fail('Could not save your reaction. Try again.')
    return ok({ active: true })
  }

  const { error } = await db()
    .from('post_reactions')
    .delete()
    .eq('post_id', postId)
    .eq('profile_id', profileId)
    .eq('reaction_type', reactionType)
  if (error) return fail('Could not remove your reaction. Try again.')
  return ok({ active: false })
}

/**
 * Add a member comment on a Space Update. Member-gated: a real signed-in profile, and the parent must
 * belong to a space_update thread. Inserts a public.posts reply (parent_id set, post_type 'feed',
 * scope + visibility inherited from the parent) through the admin client, WITHOUT the feed's Crew+
 * comment gate or gamification. Returns the new comment id.
 */
export async function commentOnSpaceUpdate(
  slug: string,
  parentPostId: string,
  body: string,
): Promise<ActionResult<{ id: string }>> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Sign in to comment.')

  const trimmed = body.trim().slice(0, 5000)
  if (!trimmed) return fail('Write something first.')
  const spaceId = await spaceUpdateThreadSpaceId(parentPostId)
  if (!spaceId) return fail('That update is not available.')
  if (!(await canInteractWithSpace(spaceId, profileId))) return fail('Follow this space to join the conversation.')

  // Inherit scope + visibility from the parent so the reply sits in the same thread.
  const { data: parent } = await db()
    .from('posts')
    .select('scope_id, visibility')
    .eq('id', parentPostId)
    .maybeSingle()
  const p = parent as { scope_id: string | null; visibility: string | null } | null
  if (!p) return fail('That update is not available.')

  const { data, error } = await db()
    .from('posts')
    .insert({
      author_id: profileId,
      body: trimmed,
      scope_id: p.scope_id,
      visibility: p.visibility ?? 'public',
      post_type: 'feed',
      parent_id: parentPostId,
    })
    .select('id')
    .single()
  if (error || !data) return fail('Could not post your comment. Try again.')

  revalidateLanding(slug)
  return ok({ id: (data as { id: string }).id })
}
