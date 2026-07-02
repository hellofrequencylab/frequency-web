'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Send, Check, Loader2 } from 'lucide-react'
import { isError } from '@/lib/action-result'
import { setJourneyVisibility, adoptJourney } from '@/app/(main)/journeys/actions'
import type { PlanVisibility } from '@/lib/journey-plans'

// The creator's controls on the View (learn) page — the counterpart to the editor's action set.
// "Edit Journey" returns to the builder; while the Journey is still a DRAFT an orange "Publish"
// sits next to it (owner's button-convention pass: "in preview mode add an orange Publish button
// next to the Edit Journey button"). Publishing flips it to a quiet "Published" state in place.
export function JourneyAuthorActions({
  slug,
  planId,
  visibility,
}: {
  slug: string
  planId: string
  visibility: PlanVisibility
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [justPublished, setJustPublished] = useState(false)
  const [adopt, setAdopt] = useState(true)
  const live = visibility === 'public' || justPublished

  const publish = () =>
    start(async () => {
      const res = await setJourneyVisibility(planId, 'public')
      if (!isError(res)) {
        // Optionally adopt it for yourself too, so you can run it from On Air.
        if (adopt) await adoptJourney(planId)
        setJustPublished(true)
        router.refresh()
      }
    })

  const btn = 'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors'
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link href={`/journeys/${slug}/edit`} className={`${btn} border border-border text-text hover:bg-surface-elevated`}>
        <Pencil className="h-3.5 w-3.5" /> Edit Journey
      </Link>
      {live ? (
        <span className={`${btn} border border-success/40 bg-success-bg font-semibold text-success`}>
          <Check className="h-3.5 w-3.5" /> Published
        </span>
      ) : (
        <>
          <button
            type="button"
            onClick={publish}
            disabled={pending}
            className={`${btn} bg-primary font-semibold text-on-primary hover:bg-primary-hover disabled:opacity-60`}
          >
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            {pending ? 'Publishing…' : 'Publish'}
          </button>
          <label
            title="Assign yourself every practice so you can run it from Mindless."
            className="inline-flex items-center gap-1.5 text-sm text-muted"
          >
            <input
              type="checkbox"
              checked={adopt}
              onChange={(e) => setAdopt(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-border accent-primary"
            />
            Adopt it for myself
          </label>
        </>
      )}
    </div>
  )
}
