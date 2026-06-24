'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Wand2 } from 'lucide-react'
import { remixTemplateAction } from '@/app/(main)/circles/remix-actions'

// The "Remix" button on a Starter Circle card (NAMING.md: the verb is Remix, the
// gloss is "Make it yours"). Remixes the template into a private draft the member
// owns, then routes them into the builder. Client-side because it mutates + navigates.
export function RemixButton({ templateId }: { templateId: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const remix = () => {
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
    <div>
      <button
        type="button"
        onClick={remix}
        disabled={pending}
        title="Claim this circle, or make it your own."
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-60"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Wand2 className="h-4 w-4" aria-hidden />}{' '}
        {pending ? 'Starting…' : 'Remix'}
      </button>
      {error && <p className="mt-1.5 text-2xs text-danger">{error}</p>}
    </div>
  )
}
