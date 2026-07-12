'use server'

// Server actions for the marketplace listing Q&A feed (listing_comments). Forked down from the events
// social-actions to a lean v1: post a comment, delete a comment. The admin client bypasses RLS, so
// every action re-checks authorization here server-side (same posture as the events feed). The table
// is new, so it is reached through an untyped handle (repo convention).

import type { SupabaseClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMyProfileId, isPlatformStaff } from '@/lib/auth'
import { type ActionResult, ok, fail } from '@/lib/action-result'
import type { ListingCommentTargetKind } from '@/lib/listings-shared/detail-view'

const MAX_BODY = 2000
const TARGET_KINDS: ListingCommentTargetKind[] = ['market_listing', 'listing', 'product']

// The listing table + owner column each target_kind resolves to (for the delete authz gate).
const OWNER_LOOKUP: Record<ListingCommentTargetKind, { table: string; ownerCol: string }> = {
  market_listing: { table: 'market_listings', ownerCol: 'author_id' },
  listing: { table: 'listings', ownerCol: 'owner_profile_id' },
  product: { table: 'commerce_products', ownerCol: 'owner_profile_id' },
}

function db(): SupabaseClient {
  return createAdminClient()
}

/** True when this profile owns the listing the comment hangs off (so they can moderate its thread). */
async function isListingOwner(
  admin: SupabaseClient,
  targetKind: ListingCommentTargetKind,
  targetId: string,
  profileId: string,
): Promise<boolean> {
  const { table, ownerCol } = OWNER_LOOKUP[targetKind]
  const { data } = await admin.from(table).select(ownerCol).eq('id', targetId).maybeSingle()
  return !!data && (data as unknown as Record<string, unknown>)[ownerCol] === profileId
}

/** Post a Q&A comment (text + optional already-uploaded image URL) on a listing. `revalidate` is the
 *  detail-page path the caller wants refreshed (each vertical lives at a different route). */
export async function postListingComment(
  targetKind: ListingCommentTargetKind,
  targetId: string,
  revalidate: string,
  body: string,
  imageUrl: string | null,
): Promise<ActionResult<void>> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Sign in to ask a question.')
  if (!TARGET_KINDS.includes(targetKind)) return fail('That listing type is not supported.')

  // A photo is an optional attachment to a written question; body is required (the DB CHECK enforces
  // a non-empty body), so an image alone is not a comment.
  const trimmed = (body ?? '').trim().slice(0, MAX_BODY)
  const image = imageUrl?.trim() || null
  if (!trimmed) return fail('Write a question or note first.')

  const admin = db()
  const { error } = await admin.from('listing_comments').insert({
    target_kind: targetKind,
    target_id: targetId,
    profile_id: profileId,
    body: trimmed,
    image_url: image,
  })
  if (error) {
    console.error('[postListingComment]', error.message)
    return fail('Could not post your comment. Please try again.')
  }

  if (revalidate) revalidatePath(revalidate)
  return ok()
}

/** Delete a comment. The author, the listing owner, or platform staff may remove it. */
export async function deleteListingComment(commentId: string, revalidate: string): Promise<void> {
  const profileId = await getMyProfileId()
  if (!profileId) return

  const admin = db()
  const { data: row } = await admin
    .from('listing_comments')
    .select('id, target_kind, target_id, profile_id')
    .eq('id', commentId)
    .maybeSingle()
  if (!row) return

  const comment = row as { target_kind: ListingCommentTargetKind; target_id: string; profile_id: string }
  const canDelete =
    comment.profile_id === profileId ||
    (await isPlatformStaff()) ||
    (await isListingOwner(admin, comment.target_kind, comment.target_id, profileId))
  if (!canDelete) return

  await admin.from('listing_comments').delete().eq('id', commentId)
  if (revalidate) revalidatePath(revalidate)
}
