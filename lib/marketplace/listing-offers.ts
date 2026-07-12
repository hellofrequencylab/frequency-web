'use server'

// Contact + Offer for the marketplace listing detail page. The Contact dialog opens (or reuses) a 1:1
// DM to the seller and drops the buyer's message in; when the buyer names a price it ALSO records a row
// in listing_offers (the right-rail "Highest offer" reads the MAX of open offers). No payment happens
// in-app — this is message + optional offer only.
//
// Same posture as ./listing-qna-actions.ts: the service-role admin client bypasses RLS, so every write
// re-checks authorization here (viewer signed in, and a buyer cannot contact/offer on their own listing).
// The listing_offers table is new, so it is reached through the untyped admin handle (repo convention).
//
// Voice (CONTENT-VOICE §10): plain, no narrated feelings, no em/en dashes. Money is USD only.

import type { SupabaseClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMyProfileId } from '@/lib/auth'
import { findOrCreateDirectConversation } from '@/lib/messages/direct-conversation'

export type OfferTargetKind = 'market_listing' | 'listing' | 'product'

const TARGET_KINDS: OfferTargetKind[] = ['market_listing', 'listing', 'product']
const MAX_MESSAGE = 4000

// The listing table + owner column each target_kind resolves to (to find the SELLER + the self-listing guard).
const SELLER_LOOKUP: Record<OfferTargetKind, { table: string; ownerCol: string }> = {
  market_listing: { table: 'market_listings', ownerCol: 'author_id' },
  listing: { table: 'listings', ownerCol: 'owner_profile_id' },
  product: { table: 'commerce_products', ownerCol: 'owner_profile_id' },
}

// listing_offers is new, so it is reached through an UNTYPED admin handle until lib/database.types.ts is
// regenerated (repo convention — same as ./listing-comments.ts). The service-role client bypasses RLS.
function db(): SupabaseClient {
  return createAdminClient()
}

/** Cents to a plain USD label, e.g. 29900 -> "$299", 29950 -> "$299.50". Whole dollars drop the cents. */
function formatCents(cents: number): string {
  const dollars = cents / 100
  const whole = Number.isInteger(dollars)
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(dollars)
}

/** Resolve the seller's profile id for a target row, or null if the row / column is missing. */
async function resolveSellerId(
  admin: SupabaseClient,
  targetKind: OfferTargetKind,
  targetId: string,
): Promise<string | null> {
  const { table, ownerCol } = SELLER_LOOKUP[targetKind]
  const { data } = await admin.from(table).select(ownerCol).eq('id', targetId).maybeSingle()
  if (!data) return null
  const seller = (data as unknown as Record<string, unknown>)[ownerCol]
  return typeof seller === 'string' ? seller : null
}

/**
 * Contact the seller from a listing detail page: open/reuse a 1:1 DM, post the buyer's message, and
 * (when `offerCents > 0`) record an offer. Returns the conversation id so the client can link to it.
 * Fail-safe: any throw is caught and reported as a { error } the dialog surfaces.
 */
export async function submitListingContact(input: {
  targetKind: OfferTargetKind
  targetId: string
  message: string
  offerCents?: number | null
  revalidate: string
}): Promise<{ ok: true; conversationId: string } | { error: string }> {
  try {
    if (!TARGET_KINDS.includes(input.targetKind)) return { error: 'That listing type is not supported.' }

    const viewerId = await getMyProfileId()
    if (!viewerId) return { error: 'Sign in to contact the seller.' }

    const message = (input.message ?? '').trim().slice(0, MAX_MESSAGE)
    if (!message) return { error: 'Write a message first.' }

    // A named price is optional; when present it must be a positive whole-cent amount (DB CHECK amount_cents > 0).
    const offerCents =
      input.offerCents != null && Number.isFinite(input.offerCents) && input.offerCents > 0
        ? Math.round(input.offerCents)
        : null

    const admin = db()

    const sellerId = await resolveSellerId(admin, input.targetKind, input.targetId)
    if (!sellerId) return { error: 'This listing is no longer available.' }
    if (sellerId === viewerId) return { error: 'This is your own listing.' }

    // Open or reuse the buyer↔seller 1:1 thread. The marketplace enquiry does NOT gate on friendship,
    // so it uses findOrCreateDirectConversation (not startConversation).
    const conversationId = await findOrCreateDirectConversation(admin, viewerId, sellerId)

    // Body = the buyer's message, with the named price prepended as a plain line when they made an offer.
    const body = offerCents ? `Offer: ${formatCents(offerCents)}.\n\n${message}` : message

    // Match the messages-insert shape used by sendMessage (app/(main)/messages/actions.ts): conversation_id,
    // sender_id, body.
    const { error: msgError } = await admin.from('messages').insert({
      conversation_id: conversationId,
      sender_id: viewerId,
      body,
    })
    if (msgError) return { error: 'Could not send your message. Please try again.' }

    // Mark the sender read up to now, mirroring sendMessage (keeps their own outgoing note from unreading them).
    await admin
      .from('conversation_participants')
      .update({ last_read_at: new Date().toISOString() })
      .eq('conversation_id', conversationId)
      .eq('profile_id', viewerId)

    if (offerCents) {
      const { error: offerError } = await admin.from('listing_offers').insert({
        target_kind: input.targetKind,
        target_id: input.targetId,
        profile_id: viewerId,
        amount_cents: offerCents,
        message,
      })
      if (offerError) {
        // The message already landed; report the offer failure but do not lose the conversation.
        console.error('[submitListingContact] offer insert', offerError.message)
        return { error: 'Your message was sent, but the offer did not save. Please try the offer again.' }
      }
    }

    if (input.revalidate) revalidatePath(input.revalidate)
    revalidatePath(`/messages/${conversationId}`)
    return { ok: true, conversationId }
  } catch (err) {
    console.error('[submitListingContact]', err instanceof Error ? err.message : err)
    return { error: 'Something went wrong. Please try again.' }
  }
}

/**
 * Highest OPEN offer (max amount_cents) on a target, or null if there are none. Plain server READ through
 * the admin client — NOT a form action — so the page/view-model can compute the right-rail number
 * server-side without leaking any per-buyer row. Fail-safe to null (a pre-migration table reads as empty).
 */
export async function getHighestOfferCents(
  targetKind: OfferTargetKind,
  targetId: string,
): Promise<number | null> {
  const { data, error } = await db()
    .from('listing_offers')
    .select('amount_cents')
    .eq('target_kind', targetKind)
    .eq('target_id', targetId)
    .eq('status', 'open')
    .order('amount_cents', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error || !data) return null
  const cents = (data as { amount_cents: number | null }).amount_cents
  return typeof cents === 'number' && cents > 0 ? cents : null
}
