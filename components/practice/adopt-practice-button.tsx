'use client'

import { useTransition } from 'react'
import { Plus, Check, X } from 'lucide-react'
import { adoptPracticeAction, dropPracticeAction } from '@/app/(main)/practices/actions'

// Toggle a practice in/out of your personal practices. Adopt adds it to "Your practices" (where you
// can log it); drop deactivates it. Adopted reads as ORANGE (the primary fill) so the card shows at
// a glance that it's yours; clicking it removes. `fullWidth` is the card-footer variant.
export function AdoptPracticeButton({
  practiceId,
  adopted,
  fullWidth = false,
}: {
  practiceId: string
  adopted: boolean
  fullWidth?: boolean
}) {
  const [pending, start] = useTransition()
  const base = `inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors disabled:opacity-60 ${
    fullWidth ? 'w-full' : ''
  }`

  if (adopted) {
    return (
      <button
        type="button"
        disabled={pending}
        title="Remove from your practices"
        onClick={() => start(async () => void (await dropPracticeAction(practiceId)))}
        className={`${base} bg-primary text-on-primary hover:bg-primary-hover`}
      >
        {pending ? (
          <>
            <X className="h-4 w-4 shrink-0" /> Removing…
          </>
        ) : (
          <>
            <Check className="h-4 w-4 shrink-0" /> Adopted
          </>
        )}
      </button>
    )
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(async () => void (await adoptPracticeAction(practiceId)))}
      className={`${base} border border-border bg-surface text-text hover:border-primary hover:text-primary-strong`}
    >
      <Plus className="h-4 w-4 shrink-0" /> {pending ? 'Adding…' : 'Adopt'}
    </button>
  )
}
