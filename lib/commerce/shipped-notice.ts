// The "your order is on its way" notice's subject and receipt content (EMAIL-027): pure, apart from the
// fulfilment writer, so the stock catalog renders it with fixtures and the probe can see it.
import { receiptDate, type ReceiptContent } from '@/lib/billing/receipt-email'
import type { OrderFulfilment } from './fulfilment-state'

export function shippedNoticeContent(input: {
  greetingName: string | null
  seller: string
  /** "Two mugs, One print", or null. */
  summary: string | null
  /** The first line's title, or null. */
  first: string | null
  fulfilment: Pick<OrderFulfilment, 'carrier' | 'tracking' | 'trackingUrl' | 'shippedAt'>
  ordersUrl: string
}): { subject: string; content: ReceiptContent } {
  const what = input.first ?? 'Your order'
  const f = input.fulfilment
  const seller = input.seller
  const content: ReceiptContent = {
    greetingName: input.greetingName,
    lead: input.summary ? `Your order from ${seller} is on its way: ${input.summary}.` : `Your order from ${seller} is on its way.`,
    lines: [
      { label: 'Carrier', value: f.carrier ?? '' },
      { label: 'Tracking', value: f.tracking ?? '' },
      { label: 'Shipped', value: receiptDate(f.shippedAt ? new Date(f.shippedAt) : new Date()) },
    ],
    closing: [
      f.trackingUrl
        ? 'Follow the tracking link to see where it is.'
        : f.tracking
          ? 'Look up the tracking number with the carrier to see where it is.'
          : `${seller} will have the tracking details if you need them.`,
      'My orders keeps every purchase you make on Frequency, with the seller and the total.',
    ],
    actionLabel: f.trackingUrl ? 'Track it' : 'See my orders',
    actionUrl: f.trackingUrl ?? input.ordersUrl,
  }
  return { subject: `${what} is on its way`, content }
}
