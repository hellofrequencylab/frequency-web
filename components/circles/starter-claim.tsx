'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Sparkles } from 'lucide-react'
import { remixTemplateAction } from '@/app/(main)/circles/remix-actions'

// The "Claim this circle" banner on a Starter Circle preview. A Starter is a
// staff-made blueprint we surface near the viewer; claiming it remixes the
// blueprint into a private draft the member owns (NAMING.md: the verb is Remix,
// the gloss is "Claim this circle, or make it your own"), then routes them into
// the builder. Client-side because it mutates + navigates. Errors surface inline;
// the action itself enforces sign-in and rejects demo profiles.
export function StarterClaim({ templateId }: { templateId: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const claim = () => {
    setError(null)
    start(async () => {
      try {
        const res = await remixTemplateAction(templateId)
        router.push(`/circles/${res.slug}/edit`)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not start your draft. Try again.')
      }
    })
  }

  return (
    <div className="mb-6 rounded-2xl border border-primary-bg bg-primary-bg/40 p-4 dark:bg-primary-bg/15">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-bg text-primary-strong">
            <Sparkles className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-text">This is a Starter Circle</p>
            <p className="text-sm text-muted">
              A blueprint we set up so there is one ready near you. Claim it to make it your own. You
              get a private draft to shape before anyone sees it.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={claim}
          disabled={pending}
          title="Claim this circle, or make it your own."
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Sparkles className="h-4 w-4" aria-hidden />}
          {pending ? 'Starting…' : 'Remix'}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </div>
  )
}
