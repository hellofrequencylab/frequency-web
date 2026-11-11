'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { ShoppingCart } from 'lucide-react'
import { buttonClasses } from '@/components/ui/button'
import { addToCartAction } from './cart-actions'

const COPY: Record<string, string> = {
  'signed-out': 'Sign in to save this to your cart.',
  'cart-full': 'Your cart is full. Check out or clear a few things first.',
  'slow-down': 'Easy there. Try again in a moment.',
  failed: 'That did not save. Try again.',
}

// Add a product to the buyer's saved cart (DEF-ETSY P5). Rendered only while COMMERCE_CART_ENABLED is on;
// it saves lines, never a price, so checkout still reads the live price.
export function AddToCartButton({ productId, variantId = null }: { productId: string; variantId?: string | null }) {
  const [pending, start] = useTransition()
  const [note, setNote] = useState<string | null>(null)
  const [added, setAdded] = useState(false)

  function add() {
    setNote(null)
    start(async () => {
      const res = await addToCartAction(productId, variantId, 1)
      if (res.ok) setAdded(true)
      else setNote(COPY[res.error] ?? COPY.failed)
    })
  }

  return (
    <div className="space-y-1">
      <button type="button" onClick={add} disabled={pending} className={buttonClasses('secondary')}>
        <ShoppingCart className="h-4 w-4" aria-hidden />
        {added ? 'In your cart' : 'Add to cart'}
      </button>
      {added ? (
        <p className="text-body-sm">
          <Link href="/cart" className="text-primary underline-offset-2 hover:underline">View your cart</Link>
        </p>
      ) : null}
      {note ? <p role="status" className="text-body-sm text-subtle">{note}</p> : null}
    </div>
  )
}
