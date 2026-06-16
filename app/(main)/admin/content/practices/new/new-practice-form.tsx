'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight } from 'lucide-react'
import { isError } from '@/lib/action-result'
import { createPracticeAction } from '@/app/(main)/practices/actions'

// The admin "Add practice" form — a FULL PAGE (not a modal): name the practice, optionally
// describe it, then land in the same PracticeBuilder editor members use. Reuses the existing
// createPracticeAction (the new practice is owned by the operator who created it) and hands off
// to /practices/[id]/edit for the rich fields (pillar, cadence, rewards, tags, cover).
export function NewPracticeForm() {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const router = useRouter()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) {
      setError('Give the practice a name.')
      return
    }
    setError(null)
    start(async () => {
      const r = await createPracticeAction(title, description)
      if (isError(r)) setError(r.error)
      else router.push(`/practices/${r.data.id}/edit`)
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
          placeholder="Morning breathwork"
          className="mt-1 w-full rounded-lg border border-border bg-canvas px-3 py-2 text-sm text-text placeholder:text-subtle focus:border-border-strong focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </label>

      <label className="block">
        <span className="text-sm font-semibold text-text">
          Description <span className="font-normal text-subtle">(optional)</span>
        </span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="A short line on what this practice is and why it helps."
          className="mt-1 w-full rounded-lg border border-border bg-canvas px-3 py-2 text-sm text-text placeholder:text-subtle focus:border-border-strong focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <span className="mt-1 block text-xs text-muted">You can flesh out the rest in the editor next.</span>
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
