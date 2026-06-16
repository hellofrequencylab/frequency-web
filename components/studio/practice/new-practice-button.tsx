'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Loader2 } from 'lucide-react'
import { isError } from '@/lib/action-result'
import { createPracticeDraftAction } from '@/app/(main)/practices/actions'

// "Create a practice" — opens the full PracticeBuilder popup straight away (no separate "name it"
// step or full page). Creates a non-public draft, then drops you into the fully-featured editor;
// the draft only joins the public library once it's published. Uniform filled button by default,
// matching New Journey and the other create entry points.
export function NewPracticeButton({ className, label = 'Create a practice' }: { className?: string; label?: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()

  function launch() {
    start(async () => {
      const r = await createPracticeDraftAction()
      if (!isError(r)) router.push(`/practices/${r.data.id}/edit`)
    })
  }

  return (
    <button
      type="button"
      onClick={launch}
      disabled={pending}
      className={
        className ??
        'inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-60'
      }
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} {label}
    </button>
  )
}
