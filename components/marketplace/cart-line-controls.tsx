'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Minus, Plus, Trash2 } from 'lucide-react'
import { removeFromCartAction, setCartQtyAction } from '@/app/(main)/marketplace/cart-actions'
import { MAX_QTY_PER_LINE } from '@/lib/commerce/cart'

// The quantity stepper and remove control for one saved-cart line (DEF-ETSY P5, /cart). It only changes the
// saved line; the price shown beside it is read fresh on the server and re-read on every refresh.
export function CartLineControls({ lineKey, qty, max, title }: { lineKey: string; qty: number; max: number | null; title: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [note, setNote] = useState<string | null>(null)
  const ceiling = max === null ? MAX_QTY_PER_LINE : Math.min(MAX_QTY_PER_LINE, max)

  function run(next: () => ReturnType<typeof setCartQtyAction>) {
    setNote(null)
    start(async () => {
      const res = await next()
      if (res.ok) router.refresh()
      else setNote(res.error === 'slow-down' ? 'Easy there. Try again in a moment.' : 'That did not save. Try again.')
    })
  }

  const step = 'inline-flex h-9 w-9 items-center justify-center rounded-control border border-border bg-surface text-text hover:bg-surface-elevated disabled:opacity-50'

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <button type="button" className={step} disabled={pending || qty <= 1} aria-label={`One fewer ${title}`} onClick={() => run(() => setCartQtyAction(lineKey, qty - 1))}>
          <Minus className="h-4 w-4" aria-hidden />
        </button>
        <span className="min-w-6 text-center text-body-sm font-semibold text-text" aria-live="polite">{qty}</span>
        <button type="button" className={step} disabled={pending || qty >= ceiling} aria-label={`One more ${title}`} onClick={() => run(() => setCartQtyAction(lineKey, qty + 1))}>
          <Plus className="h-4 w-4" aria-hidden />
        </button>
        <button type="button" className="ml-2 inline-flex items-center gap-1 text-body-sm text-subtle hover:text-text disabled:opacity-50" disabled={pending} onClick={() => run(() => removeFromCartAction(lineKey))}>
          <Trash2 className="h-4 w-4" aria-hidden />
          Remove
        </button>
      </div>
      {note ? <p role="status" className="text-body-sm text-subtle">{note}</p> : null}
    </div>
  )
}
