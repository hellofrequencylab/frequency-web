'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Wand2 } from 'lucide-react'
import { remixTemplateAction } from '@/app/(main)/circles/remix-actions'
import { CrewGateButton } from '@/components/crew/upgrade-lightbox'

// The "Remix" button on a Starter Circle card (NAMING.md: the verb is Remix, the
// gloss is "Make it yours"). Remixes the template into a private draft the member
// owns, then routes them into the builder. Client-side because it mutates + navigates.
// The action enforces circle.create (a Remix mints a Circle you host, ADR-891);
// `canCreate` swaps the button for the free-beta Crew upsell instead of a server error.
export function RemixButton({ templateId, canCreate = true }: { templateId: string; canCreate?: boolean }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  if (!canCreate) {
    return (
      <CrewGateButton
        isCrew={false}
        label="Remix"
        reason="create-circle"
        buttonClassName="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-body-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
      />
    )
  }

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
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-body-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-60"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Wand2 className="h-4 w-4" aria-hidden />}{' '}
        {pending ? 'Starting…' : 'Remix'}
      </button>
      {error && <p className="mt-1.5 text-2xs text-danger">{error}</p>}
    </div>
  )
}
