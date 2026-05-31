'use client'

import { useTransition } from 'react'
import { Plus, X } from 'lucide-react'
import { adoptPracticeAction, dropPracticeAction } from '@/app/(main)/practices/actions'

// Toggle a practice in/out of your personal practices. Adopt adds it to "Your
// practices" (where you can log it); drop deactivates it.
export function AdoptPracticeButton({
  practiceId,
  adopted,
}: {
  practiceId: string
  adopted: boolean
}) {
  const [pending, start] = useTransition()

  if (adopted) {
    return (
      <button
        disabled={pending}
        onClick={() => start(async () => void (await dropPracticeAction(practiceId)))}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium text-muted hover:text-danger hover:border-danger disabled:opacity-60 transition-colors"
      >
        <X className="w-4 h-4" /> {pending ? 'Removing…' : 'Remove'}
      </button>
    )
  }

  return (
    <button
      disabled={pending}
      onClick={() => start(async () => void (await adoptPracticeAction(practiceId)))}
      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium text-text hover:border-primary hover:text-primary-strong disabled:opacity-60 transition-colors"
    >
      <Plus className="w-4 h-4" /> {pending ? 'Adding…' : 'Adopt'}
    </button>
  )
}
