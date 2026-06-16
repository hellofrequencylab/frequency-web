'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Loader2 } from 'lucide-react'
import { isError } from '@/lib/action-result'
import { createJourney } from '@/app/(main)/journeys/actions'

// "New journey" — opens the full journey editor popup straight away (no separate "name it" step
// or full page). Creates a private draft (createJourney), then drops you into the fully-featured
// editor at /journeys/[slug]/edit. Uniform filled button by default, matching Create a practice
// and the other create entry points.
export function NewJourneyButton({ className, label = 'New journey' }: { className?: string; label?: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()

  function launch() {
    start(async () => {
      const r = await createJourney({ title: 'Untitled journey' })
      if (!isError(r)) router.push(`/journeys/${r.data.slug}/edit`)
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
