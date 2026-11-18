import { sellerNameKey, type CommerceOrder, type OrderLineSeller } from '@/lib/commerce/orders'

// ORDER MESSAGES (DEF-ETSY P6). A buyer asks a seller about an order in the ordinary 1:1 message
// thread (conversations + messages, the same backend as /messages and the service enquiry), so no new
// table: the thread is the pair's, and the first line names the order so both sides know which one.
// PURE: the server action (app/(main)/orders/order-message-actions.ts) owns the reads and the gates.

/** Order states a buyer can write to a seller about: something was actually bought. */
const MESSAGEABLE = new Set(['paid', 'fulfilled', 'refunded'])

export function orderIsMessageable(status: string): boolean {
  return MESSAGEABLE.has(status)
}

/** The seller behind this key on this order, with their lines, or null when no line of the order is
 *  theirs (a forged key never resolves to someone the buyer did not buy from). */
export function orderSellerLines(
  order: Pick<CommerceOrder, 'items'>,
  key: string,
): { seller: OrderLineSeller; titles: string[] } | null {
  let seller: OrderLineSeller | null = null
  const titles: string[] = []
  for (const it of order.items) {
    if (!it.seller || sellerNameKey(it.seller) !== key) continue
    seller = it.seller
    titles.push(it.title)
  }
  return seller ? { seller, titles } : null
}

/** The line that opens the thread: which order, from when, and what was in it. Plain, no em dashes. */
export function orderMessageOpener(input: { orderId: string; createdAt: string; titles: string[] }): string {
  const when = new Date(input.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
  const shown = input.titles.slice(0, 3).join(', ')
  const more = input.titles.length > 3 ? ` and ${input.titles.length - 3} more` : ''
  return `Hi! I have a question about my order from ${when}: ${shown}${more}. Order ref ${input.orderId.slice(0, 8)}.`
}
