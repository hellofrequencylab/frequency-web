'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { createPracticeAction } from '@/app/(main)/practices/actions'
import { isError } from '@/lib/action-result'

// Create a custom practice (added to the public library + adoptable). The backend
// createPractice already exists; this is its UI. No migration needed.
export function CreatePracticeForm() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [pending, start] = useTransition()

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-strong hover:underline"
      >
        <Plus className="w-4 h-4" /> Create a practice
      </button>
    )
  }

  return (
    <div className="rounded-xl border border-border bg-surface-elevated p-4">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Practice name"
        aria-label="Practice name"
        maxLength={80}
        className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-subtle"
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Short description (optional)"
        aria-label="Practice description"
        rows={2}
        maxLength={280}
        className="mt-2 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-subtle"
      />
      {err && <p className="mt-2 text-xs text-danger">{err}</p>}
      <div className="mt-3 flex items-center gap-2">
        <button
          disabled={pending || !title.trim()}
          onClick={() =>
            start(async () => {
              const r = await createPracticeAction(title, description)
              if (isError(r)) setErr(r.error)
              else {
                setTitle('')
                setDescription('')
                setErr(null)
                setOpen(false)
                // Open the editor so they can flesh out cadence, guide, pillar, etc.
                router.push(`/practices/${r.data.id}/edit`)
              }
            })
          }
          className="rounded-lg bg-primary hover:bg-primary-hover text-on-primary px-4 py-1.5 text-sm font-semibold disabled:opacity-50 transition-colors"
        >
          {pending ? 'Creating…' : 'Create'}
        </button>
        <button
          onClick={() => {
            setOpen(false)
            setErr(null)
          }}
          className="rounded-lg border border-border px-4 py-1.5 text-sm font-medium text-text"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
