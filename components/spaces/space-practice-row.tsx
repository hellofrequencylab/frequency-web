'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Pencil, Radio, Globe, Loader2 } from 'lucide-react'
import { buttonClasses } from '@/components/ui/button'
import { isError } from '@/lib/action-result'
import { setSpacePracticeLiveAction, submitSpacePracticeToLibraryAction } from '@/app/(main)/spaces/[slug]/practices/actions'

// One row in a Space's own Practices manager: identity + a state badge + the lifecycle actions an
// owner takes. A practice is born a private Draft, goes Live in the Space (own-space, no review),
// and can then be submitted to the public Library (paid Crew + staff review). Each action re-gates
// server-side; a failed submit (e.g. the paid-Crew gate) surfaces its message inline.

interface RowPractice {
  id: string
  title: string
  slug: string | null
  status: string | null
  is_public: boolean
  icon: string | null
  summary: string | null
}

/** The member-facing state of a Space practice, from its status + library flag. */
function statusBadge(p: RowPractice): { label: string; cls: string } {
  if (p.is_public) return { label: 'In library', cls: 'bg-success-bg text-success' }
  if (p.status === 'approved') return { label: 'Live in space', cls: 'bg-primary-bg text-primary-strong' }
  return { label: 'Draft', cls: 'bg-surface-elevated text-muted' }
}

export function SpacePracticeRow({ practice, slug }: { practice: RowPractice; slug: string }) {
  const [pending, start] = useTransition()
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const badge = statusBadge(practice)

  const isDraft = practice.status !== 'approved' && !practice.is_public
  const canSubmit = practice.status === 'approved' && !practice.is_public

  const makeLive = () =>
    start(async () => {
      setNote(null)
      setError(null)
      const res = await setSpacePracticeLiveAction(slug, practice.id)
      if (isError(res)) { setError(res.error); return }
      setNote('Live in your space. Your members can practise it now.')
    })

  const submitToLibrary = () =>
    start(async () => {
      setNote(null)
      setError(null)
      const res = await submitSpacePracticeToLibraryAction(slug, practice.id)
      if (isError(res)) { setError(res.error); return }
      setNote('Sent to the library for review. We will let you know when it is approved.')
    })

  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-bg text-lg" aria-hidden>
          {practice.icon ?? '🌀'}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/practices/${practice.id}/edit`} className="truncate text-base font-bold text-text hover:text-primary-strong">
              {practice.title}
            </Link>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-2xs font-semibold ${badge.cls}`}>{badge.label}</span>
          </div>
          {practice.summary && <p className="mt-0.5 line-clamp-1 text-sm text-muted">{practice.summary}</p>}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border pt-3">
        <Link href={`/practices/${practice.id}/edit`} className={buttonClasses('primary', 'sm')}>
          <Pencil className="h-3.5 w-3.5" /> Edit
        </Link>
        {isDraft && (
          <button type="button" disabled={pending} onClick={makeLive} className={buttonClasses('secondary', 'sm')}>
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Radio className="h-3.5 w-3.5" />} Make live in your space
          </button>
        )}
        {canSubmit && (
          <button type="button" disabled={pending} onClick={submitToLibrary} className={buttonClasses('secondary', 'sm')}>
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Globe className="h-3.5 w-3.5" />} Add to library
          </button>
        )}
      </div>
      {note && <p className="mt-2 text-xs text-muted">{note}</p>}
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </div>
  )
}
