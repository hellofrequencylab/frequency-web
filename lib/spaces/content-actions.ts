'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCallerProfile, getMyProfileId } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { spaceFunctionDef, spaceFunctionEnabled } from '@/lib/spaces/functions'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { type ActionResult, ok, fail } from '@/lib/action-result'

// SPACE CONTENT write actions (Puck content blocks, Phase 2, ADR-476/472). The operator authors
// the FAQ; a member submits a review. Mirrors the edit-page actions posture exactly:
// EVERY action RE-RESOLVES the Space from the slug and RE-GATES server-side, so the route/UI gate is
// only UX and this is the authority. Writes go through the service-role admin client (RLS bypass), so
// the gate MUST be enforced here in app code.
//
// The Space Communities wall actions (member posts, reactions, comments, pin/remove moderation) were
// removed in C3.4 (ADR-1091, LIVE-059): a Space's community is its Circles (ADR-1013 §3). The brand
// Updates write actions (createSpaceUpdate / updateSpaceUpdate / deleteSpaceUpdate) followed in
// LIVE-062 batch 6 by OWNER RULING (2026-08-20): their only composer died with the wall, no UI ever
// called them (0 rows, 0 published pages with the SpaceUpdates block), so the block + widget + these
// writes retire together. The space_updates TABLE stays, per C3.5's recorded retention
// (20270317000000_narrow_space_update_rls_arms.sql); git history keeps the implementation.
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
