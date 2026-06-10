'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Sparkles, Loader2, ArrowRight } from 'lucide-react'
import { StudioLaunchButton } from '../kit/studio-launch-button'
import { StudioFooter } from '../kit/studio-footer'
import { isError } from '@/lib/action-result'
import { createPracticeAction } from '@/app/(main)/practices/actions'

// Create a practice via the Studio window (replaces the inline create form). A quick
// name-it step, then drops into the full Practice builder at /practices/[id]/edit.
export function NewPracticeButton({ className }: { className?: string }) {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const create = () => {
    if (!title.trim()) { setError('Give your practice a name to begin.'); return }
    start(async () => {
      setError(null)
      const res = await createPracticeAction(title, description)
      if (isError(res)) { setError(res.error); return }
      router.push(`/practices/${res.data.id}/edit`)
    })
  }

  return (
    <StudioLaunchButton
      label="Create a practice"
      icon={Plus}
      className={className ?? 'inline-flex items-center gap-1.5 text-sm font-medium text-primary-strong hover:underline'}
      eyebrow="Studio · New practice"
      footer={
        <StudioFooter
          left={<span className="text-xs text-subtle">{error ? <span className="text-danger">{error}</span> : 'You can flesh it out next.'}</span>}
        >
          <button
            type="button"
            onClick={create}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-60"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />} Start building
          </button>
        </StudioFooter>
      }
    >
      <p className="text-sm text-muted">
        A practice is one thing you do (meditate, move, journal, breathe). Name it, then add the cadence, guide, and Pillar in the builder.
      </p>
      <div className="mt-5 flex items-start gap-3">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-primary-bg text-primary-strong">
          <Sparkles className="h-7 w-7" />
        </div>
        <div className="min-w-0 flex-1">
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') create() }}
            maxLength={80}
            placeholder="Name your practice"
            className="w-full bg-transparent text-2xl font-bold text-text outline-none placeholder:text-subtle"
          />
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={280}
            placeholder="A short description (optional)"
            className="mt-1 w-full bg-transparent text-sm text-muted outline-none placeholder:text-subtle"
          />
        </div>
      </div>
    </StudioLaunchButton>
  )
}
