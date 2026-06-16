'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight } from 'lucide-react'
import { isError } from '@/lib/action-result'
import { createJourney } from '@/app/(main)/journeys/actions'

// The admin "Add journey" form — a FULL PAGE (not a modal): name the Journey, optionally add a
// one-line summary, then land in the structure editor. Reuses createJourney (the new Journey is
// owned by the operator who created it) and hands off to /journeys/[slug]/edit for the phases,
// lessons, and practices.
export function NewJourneyForm() {
  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const router = useRouter()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) {
      setError('Give the journey a name.')
      return
    }
    setError(null)
    start(async () => {
      const r = await createJourney({ title, summary: summary.trim() || undefined })
      if (isError(r)) setError(r.error)
      else router.push(`/journeys/${r.data.slug}/edit`)
    })
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <label className="block">
        <span className="text-sm font-semibold text-text">Name</span>
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="The 30-day reset"
          className="mt-1 w-full rounded-lg border border-border bg-canvas px-3 py-2 text-sm text-text placeholder:text-subtle focus:border-border-strong focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </label>

      <label className="block">
        <span className="text-sm font-semibold text-text">
          Summary <span className="font-normal text-subtle">(optional)</span>
        </span>
        <textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          rows={3}
          placeholder="A one-line description of the path this Journey takes someone on."
          className="mt-1 w-full rounded-lg border border-border bg-canvas px-3 py-2 text-sm text-text placeholder:text-subtle focus:border-border-strong focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <span className="mt-1 block text-xs text-muted">You&apos;ll add the phases, lessons, and practices in the editor next.</span>
      </label>

      {error && <p className="text-sm font-medium text-danger">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary shadow-sm transition-colors hover:bg-primary-hover disabled:opacity-50"
        >
          {pending ? 'Creating…' : 'Create and edit'}
          {!pending && <ArrowRight className="h-4 w-4" />}
        </button>
      </div>
    </form>
  )
}
