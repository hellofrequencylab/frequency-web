'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { BookUp, Check, Clock, Loader2 } from 'lucide-react'
import { submitToLibrary } from '@/app/(main)/library/actions'
import { isError } from '@/lib/action-result'

// The member "propose to the Community Library" control (P4.8). Shown on a member's own
// practice / journey. Proposing flips its review status to 'pending' (server-side,
// ownership-checked) → it enters the leadership review queue; on approval it goes public.
// Status-aware: draft → the button; pending → "In review"; published → "In the Library".
export function ProposeToLibraryButton({
  type,
  id,
  state,
}: {
  type: 'practice' | 'journey'
  id: string
  state: 'draft' | 'pending' | 'published'
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [justSubmitted, setJustSubmitted] = useState(false)
  const router = useRouter()
  const effective = justSubmitted ? 'pending' : state

  if (effective === 'published') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-lg bg-success-bg/40 px-3 py-1.5 text-sm font-semibold text-success">
        <Check className="h-3.5 w-3.5" /> In the Library
      </span>
    )
  }
  if (effective === 'pending') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-lg bg-warning-bg/50 px-3 py-1.5 text-sm font-semibold text-warning">
        <Clock className="h-3.5 w-3.5" /> In review
      </span>
    )
  }

  function propose() {
    setError(null)
    startTransition(async () => {
      const r = await submitToLibrary(type, id)
      if (isError(r)) setError(r.error)
      else {
        setJustSubmitted(true)
        router.refresh()
      }
    })
  }

  return (
    <div className="inline-flex flex-col gap-1">
      <button
        onClick={propose}
        disabled={isPending}
        title="Submit this to the Community Library for review"
        className="inline-flex items-center gap-1.5 rounded-lg border border-primary-bg bg-primary-bg px-3 py-1.5 text-sm font-semibold text-primary-strong transition-colors hover:bg-primary-bg/70 disabled:opacity-60"
      >
        {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BookUp className="h-3.5 w-3.5" />}
        Propose to Library
      </button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  )
}
