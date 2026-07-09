'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCallerProfile, getMyProfileId } from '@/lib/auth'
import { getVisibleSpaceBySlug, getSpaceById } from '@/lib/spaces/store'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { isFollowing, listSpaceFollowerIds } from '@/lib/spaces/follows'
import { isReactionKey } from '@/lib/feed/reactions'
import { safeUrl } from '@/lib/entity-blocks/block-content'
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
  revalidatePath(`/spaces/${slug}/community`)
}

// ── Member posts on the Community feed (Phase 2b) ─────────────────────────────────────────────────
// A FOLLOWER (not just the operator) may post to the Community feed when the business allows it. Unlike
// a brand Update (a space_updates row + anchor), a member post is a plain top-level public.posts row of
// post_type = 'space_update' scoped to the Space, so it (a) reuses the SAME member react/comment plumbing
// (is_space_update_post keys off the type), (b) is read by the Community feed's union, and (c) stays OUT of
// the Home brand-updates block (which reads space_updates). Writes go through the admin client, so the gate
// is enforced HERE (signed-in + follower/operator + the business toggle on).

/** Whether the Space currently accepts member Community posts. Default ON; the operator turns it off via
 *  setCommunityMemberPosts, stored on preferences.communityMemberPosts. */
function spaceAllowsMemberPosts(preferences: unknown): boolean {
  if (!preferences || typeof preferences !== 'object' || Array.isArray(preferences)) return true
  return (preferences as Record<string, unknown>).communityMemberPosts !== false
}

/** Notify a Space's FOLLOWERS that the business posted a new Update (Phase 3). One batched insert into
 *  notifications (type 'space_update', linking to the Community tab). Best-effort + bounded; a failure never
 *  blocks the post. The actor (the poster) is excluded. */
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
      body: `${brand} posted in the community`,
    }))
    await db().from('notifications').insert(rows)
  } catch {
    // best-effort: a fan-out miss never fails the post.
  }
}

/** Post to a Space's Community feed as a FOLLOWER (or operator). Gated: signed-in, the business allows
 *  member posts, and the caller follows the Space (an operator always may). Inserts a top-level
 *  post_type='space_update' post authored by the caller. Returns the new post id (its own interaction
 *  anchor). */
export async function createMemberPost(
  slug: string,
  body: string,
  imageUrl?: string | null,
): Promise<ActionResult<{ id: string }>> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Sign in to post.')

  const space = await getVisibleSpaceBySlug(slug, profileId)
  if (!space) return fail('That space is not available.')
  if (!spaceAllowsMemberPosts(space.preferences)) return fail('This space is not taking member posts right now.')

  const caps = await getSpaceCapabilities(space, profileId)
  const isOperator = caps.canEditProfile
  if (!isOperator && !(await isFollowing(space.id, profileId))) {
    return fail('Follow this space to post in its community.')
  }

  const trimmed = body.trim().slice(0, 20000)
  const image = safeUrl(imageUrl)
  if (!trimmed && !image) return fail('Write something first.')

  const { data, error } = await db()
    .from('posts')
    .insert({
      author_id: profileId,
      body: trimmed,
      scope_id: space.id,
      visibility: 'public',
      post_type: 'space_update',
      ...(image ? { media_urls: [image] } : {}),
    })
    .select('id')
    .single()
  if (error || !data) return fail('Could not post that. Try again.')

  revalidateLanding(slug)
  return ok({ id: (data as { id: string }).id })
}

/** Upload an image for a Community post. Gated like posting: signed-in + a follower (or operator) of the
 *  Space, and the business allows member posts. Files through the same service-role event-media bucket the
 *  Space cover/block uploads use, under a space-scoped community prefix. Returns the public URL. */
export async function uploadCommunityImage(
  slug: string,
  formData: FormData,
): Promise<{ url: string } | { error: string }> {
  const profileId = await getMyProfileId()
  if (!profileId) return { error: 'Sign in to add an image.' }

  const space = await getVisibleSpaceBySlug(slug, profileId)
  if (!space) return { error: 'That space is not available.' }
  const caps = await getSpaceCapabilities(space, profileId)
  const isOperator = caps.canEditProfile
  if (!isOperator) {
    if (!spaceAllowsMemberPosts(space.preferences)) return { error: 'This space is not taking member posts right now.' }
    if (!(await isFollowing(space.id, profileId))) return { error: 'Follow this space to post in its community.' }
  }

  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) return { error: 'Choose an image file.' }
  if (!file.type.startsWith('image/')) return { error: 'Choose an image file.' }
  if (file.size > 9 * 1024 * 1024) return { error: 'Image must be under 9MB.' }

  const admin = createAdminClient()
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
  const stamp = `${Date.now()}-${Math.round(Math.random() * 1e6).toString(36)}`
  const path = `spaces/${space.id}/community/${stamp}.${ext}`
  const bytes = new Uint8Array(await file.arrayBuffer())
  const { error } = await admin.storage
    .from('event-media')
    .upload(path, bytes, { contentType: file.type || 'image/jpeg', upsert: true })
  if (error) return { error: error.message }
  return { url: admin.storage.from('event-media').getPublicUrl(path).data.publicUrl }
}

/** Pin or unpin a Community post to the top of the feed (operator only). Sets the anchor post's is_pinned
 *  flag; the feed sorts pinned posts first. Scoped to a space_update post on this Space. */
export async function pinCommunityPost(slug: string, postId: string, pin: boolean): Promise<ActionResult> {
  const auth = await authorizeEditor(slug)
  if (!auth) return fail('You do not have access to edit this page.')

  const { data } = await db().from('posts').select('id, scope_id, post_type').eq('id', postId).maybeSingle()
  const post = data as { id: string; scope_id: string | null; post_type: string } | null
  if (!post || post.post_type !== 'space_update' || post.scope_id !== auth.spaceId) {
    return fail('That post is not available.')
  }

  const { error } = await db().from('posts').update({ is_pinned: pin }).eq('id', postId)
  if (error) return fail('Could not update that post. Try again.')

  revalidateLanding(slug)
  return ok()
}

/** Turn member Community posting ON or OFF for a Space (operator control). Owner/admin/editor-gated.
 *  Stored on preferences.communityMemberPosts (default ON; only an explicit `false` is written). */
export async function setCommunityMemberPosts(slug: string, allow: boolean): Promise<ActionResult> {
  const auth = await authorizeEditor(slug)
  if (!auth) return fail('You do not have access to edit this page.')

  const admin = createAdminClient() as unknown as {
    from: (t: string) => {
      select: (c: string) => { eq: (c: string, v: string) => { maybeSingle: () => Promise<{ data: { preferences?: unknown } | null }> } }
      update: (v: Record<string, unknown>) => { eq: (c: string, v: string) => Promise<{ error: unknown }> }
    }
  }
  const { data } = await admin.from('spaces').select('preferences').eq('id', auth.spaceId).maybeSingle()
  const prefs =
    data?.preferences && typeof data.preferences === 'object' && !Array.isArray(data.preferences)
      ? { ...(data.preferences as Record<string, unknown>) }
      : {}
  if (allow) delete prefs.communityMemberPosts
  else prefs.communityMemberPosts = false

  const { error } = await admin.from('spaces').update({ preferences: prefs }).eq('id', auth.spaceId)
  if (error) return fail('Could not update that setting. Try again.')

  revalidateLanding(slug)
  return ok()
}

/** Remove a member Community post (soft-hide, so it drops from the feed). Allowed for the post's AUTHOR
 *  (removing their own) OR an OPERATOR of the Space (moderation). Scoped to a space_update post on this
 *  Space, so it can never hide an unrelated post. */
export async function removeCommunityPost(slug: string, postId: string): Promise<ActionResult> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Sign in first.')

  const { data } = await db().from('posts').select('id, author_id, scope_id, post_type').eq('id', postId).maybeSingle()
  const post = data as { id: string; author_id: string | null; scope_id: string | null; post_type: string } | null
  if (!post || post.post_type !== 'space_update') return fail('That post is not available.')

  const space = await getVisibleSpaceBySlug(slug, profileId)
  if (!space || space.id !== post.scope_id) return fail('That post is not available.')

  const isAuthor = post.author_id === profileId
  const isOperator = (await getSpaceCapabilities(space, profileId)).canEditProfile
  if (!isAuthor && !isOperator) return fail('You cannot remove that post.')

  const { error } = await db().from('posts').update({ hidden_at: new Date().toISOString(), hidden_by: profileId }).eq('id', postId)
  if (error) return fail('Could not remove that post. Try again.')

  revalidateLanding(slug)
  return ok()
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
