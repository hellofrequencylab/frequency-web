'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Trash2 } from 'lucide-react'
import { deleteDraft } from '../scan/actions'

// Two-tap delete for an unpublished draft (first tap arms, second confirms) —
// floats over the card link as its `action`, so it handles its own clicks.
export function DeleteDraftButton({ id }: { id: string }) {
  const router = useRouter()
  const [armed, setArmed] = useState(false)
  const [pending, startTransition] = useTransition()

  function handleClick() {
    if (pending) return
    if (!armed) {
      setArmed(true)
      setTimeout(() => setArmed(false), 3000)
      return
    }
    startTransition(async () => {
      await deleteDraft(id)
      router.refresh()
    })
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={armed ? 'Confirm delete' : 'Delete draft'}
      className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1.5 text-xs font-semibold transition-colors ${
        armed
          ? 'border-danger/40 bg-danger-bg text-danger'
          : 'border-border bg-surface text-subtle hover:text-danger'
      }`}
    >
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
      {armed && !pending ? 'Sure?' : null}
    </button>
  )
}
