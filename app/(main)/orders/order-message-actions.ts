'use server'

import { getMyProfileId } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { cartEnabled } from '@/lib/commerce/cart-flag'
import { getOrderForBuyer } from '@/lib/commerce/orders'
import { orderIsMessageable, orderMessageOpener, orderSellerLines } from '@/lib/commerce/order-message'
import { getSpaceById } from '@/lib/spaces/store'
import { isBlockedBetween } from '@/lib/blocking'
import { rateLimitOk } from '@/lib/rate-limit'
import { openDirectConversation, sendMessage } from '@/app/(main)/messages/actions'

// ORDER MESSAGES (DEF-ETSY P6, dark behind COMMERCE_CART_ENABLED). A buyer writes to a seller about
// an order they bought, in the ordinary 1:1 thread, with NO service-role client of its own:
//   · the order is read through getOrderForBuyer (lib/commerce/orders.ts), the caller's own and settled;
//   · the seller must own a line of it (orderSellerLines), so a forged key reaches nobody;
//   · the thread is found under the buyer's SESSION (participants RLS shows only their own threads);
//   · the message goes through sendMessage, the same action the chat dock's composer calls, so its
//     participant check, block gate, notification and read mark all apply.
// Creating a NEW thread with someone who is not a friend needs the service role (no member may insert
// another member's participant row), so this path does not. With no thread yet, a friend gets one
// through openDirectConversation (its own friendship gate); anyone else is pointed at the listing's
// Contact seller door.

interface OrderMessageResult {
  /** The thread the message landed in. An ID, not a URL (ADR-896): the caller opens the chat dock. */
  conversationId?: string
  error?: string
}

/** The buyer's existing 1:1 thread with this seller, read under the buyer's own session, or null. */
async function existingThread(buyerProfileId: string, sellerProfileId: string): Promise<string | null> {
  const supabase = await createClient()
  const { data: mine } = await supabase.from('conversation_participants').select('conversation_id').eq('profile_id', buyerProfileId)
  const ids = (mine ?? []).map((r) => r.conversation_id as string)
  if (ids.length === 0) return null
  const { data: shared } = await supabase
    .from('conversation_participants')
    .select('conversation_id')
    .in('conversation_id', ids)
    .eq('profile_id', sellerProfileId)
    .limit(1)
    .maybeSingle()
  return (shared?.conversation_id as string | undefined) ?? null
}

export async function messageSellerAboutOrder(orderId: string, sellerKey: string): Promise<OrderMessageResult> {
  if (!cartEnabled()) return { error: 'Order messages are not open yet.' }
  const buyerProfileId = await getMyProfileId()
  if (!buyerProfileId) return { error: 'Sign in to message the seller.' }

  const order = await getOrderForBuyer(orderId, buyerProfileId)
  if (!order || !orderIsMessageable(order.status)) return { error: 'That order is not available.' }
  const lines = orderSellerLines(order, sellerKey)
  if (!lines) return { error: 'That seller is not on this order.' }

  // A maker answers for their own listing; a Space listing routes to the Space owner.
  let sellerProfileId = lines.seller.kind === 'space' ? null : lines.seller.profileId
  if (lines.seller.kind === 'space' && lines.seller.spaceId) {
    sellerProfileId = (await getSpaceById(lines.seller.spaceId))?.ownerProfileId ?? null
  }
  if (!sellerProfileId) return { error: 'This seller is not reachable right now.' }
  if (sellerProfileId === buyerProfileId) return { error: 'This is your own listing.' }
  if (await isBlockedBetween(buyerProfileId, sellerProfileId)) return { error: 'You cannot message this seller.' }
  if (!(await rateLimitOk('order_message', buyerProfileId, 10, '1 h'))) {
    return { error: 'You have sent a lot of messages. Try again in a little while.' }
  }

  let conversationId = await existingThread(buyerProfileId, sellerProfileId)
  if (!conversationId) {
    const opened = await openDirectConversation(sellerProfileId)
    if (!opened.ok) {
      return { error: 'You have no conversation with this seller yet. Use Contact seller on the listing to reach them first.' }
    }
    conversationId = opened.conversationId
  }

  const fd = new FormData()
  fd.set('body', orderMessageOpener({ orderId: order.id, createdAt: order.createdAt, titles: lines.titles }))
  try {
    await sendMessage(conversationId, fd)
  } catch {
    return { error: 'Could not send your message. Try again.' }
  }
  return { conversationId }
}
