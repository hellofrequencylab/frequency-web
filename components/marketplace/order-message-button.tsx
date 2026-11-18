'use client'

import { useState, useTransition } from 'react'
import { MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { messageSellerAboutOrder } from '@/app/(main)/orders/order-message-actions'
import { openDockThread } from '@/lib/messages/dock-open'

// "Message the seller" on a line group of /orders (DEF-ETSY P6). Sends the order's opening line to
// the seller in the ordinary 1:1 thread and opens the chat dock on it (ADR-896), so the buyer stays on
// their orders. The page renders it only while COMMERCE_CART_ENABLED is on; the action checks again.
export function OrderMessageButton({ orderId, sellerKey, sellerLabel }: { orderId: string; sellerKey: string; sellerLabel: string | null }) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const send = () =>
    start(async () => {
      setError(null)
      const res = await messageSellerAboutOrder(orderId, sellerKey)
      if (res.error) setError(res.error)
      else if (res.conversationId) openDockThread({ kind: 'dm', id: res.conversationId })
    })
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <Button type="button" variant="secondary" size="sm" loading={pending} onClick={send}>
        <MessageCircle className="h-4 w-4" aria-hidden />
        {sellerLabel ? `Message ${sellerLabel}` : 'Message the seller'}
      </Button>
      {error && (
        <p role="alert" className="text-meta text-danger">
          {error}
        </p>
      )}
    </div>
  )
}
