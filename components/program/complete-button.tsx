'use client'

import { useState, useTransition } from 'react'
import { Check } from 'lucide-react'
import { markProgramCompleteAction } from '@/app/(main)/programs/actions'
import { isError } from '@/lib/action-result'

// Mark a program complete (tracks progress; idempotent). Shows a "Completed"
// state once done.
export function CompleteProgramButton({ slug, completed }: { slug: string; completed: boolean }) {
  const [done, setDone] = useState(completed)
  const [pending, start] = useTransition()

  if (done) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-lg bg-success-bg px-3 py-1.5 text-sm font-semibold text-success">
        <Check className="h-4 w-4" /> Completed
      </span>
    )
  }

  return (
    <button
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await markProgramCompleteAction(slug)
          if (!isError(r)) setDone(true)
        })
      }
      className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-1.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-60"
    >
      {pending ? 'Saving…' : 'Mark complete'}
    </button>
  )
}
