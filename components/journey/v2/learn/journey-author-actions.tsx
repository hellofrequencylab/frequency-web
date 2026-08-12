'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Send, Check, EyeOff, Loader2 } from 'lucide-react'
import { isError } from '@/lib/action-result'
import { setJourneyVisibility, adoptJourney } from '@/app/(main)/journeys/actions'
import { DangerModal } from '@/components/admin/danger-modal'
import type { PlanVisibility } from '@/lib/journey-plans'

// The creator's controls on the View (learn) page — the counterpart to the editor's action set.
// "Edit Journey" returns to the builder; while the Journey is still a DRAFT an orange "Publish"
// sits next to it (owner's button-convention pass: "in preview mode add an orange Publish button
// next to the Edit Journey button"). Publishing flips it to a quiet "Published" state in place,
// with a low-emphasis "Unpublish" beside it: taking a Journey down is risky-but-recoverable, so it
// goes through the standard DangerModal and names how many members are on it first (ADR-233 §5).
// Fine-grained visibility (private / unlisted / public) still lives in the Manage rail — this is
// the author's quick take-it-down control, not a third visibility editor.
export function JourneyAuthorActions({
  slug,
  planId,
  visibility,
  adopterCount = 0,
}: {
  slug: string
  planId: string
  visibility: PlanVisibility
  /** Members currently ON this Journey (active adoptions, excluding the author), so the unpublish
   *  confirmation can say how many people it affects. 0 when the Journey is not published. */
  adopterCount?: number
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [justPublished, setJustPublished] = useState(false)
  const [justUnpublished, setJustUnpublished] = useState(false)
  const [adopt, setAdopt] = useState(true)
  const [confirmUnpublish, setConfirmUnpublish] = useState(false)
  const live = justUnpublished ? false : visibility === 'public' || justPublished

  const publish = () =>
    start(async () => {
      const res = await setJourneyVisibility(planId, 'public')
      if (!isError(res)) {
        // Optionally adopt it for yourself too, so you can run it from On Air.
        if (adopt) await adoptJourney(planId)
        setJustUnpublished(false)
        setJustPublished(true)
        // Publishing is the start of the launch: the chokepoint says where to land (ADR-840).
        if (res.data.next) router.push(res.data.next)
        else router.refresh()
      }
    })

  // Unpublish = back to a private draft. It leaves the library, and members already on it lose the
  // Journey page (the private gate on this route is author-only) while keeping their practices.
  // The same chokepoint re-checks the caps server-side; `next` is null for private, so we stay put.
  const unpublish = () =>
    start(async () => {
      const res = await setJourneyVisibility(planId, 'private')
      if (!isError(res)) {
        setJustPublished(false)
        setJustUnpublished(true)
        router.refresh()
      }
    })

  const btn = 'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-body-sm font-medium transition-colors'
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link href={`/journeys/${slug}/edit`} className={`${btn} border border-border text-text hover:bg-surface-elevated`}>
        <Pencil className="h-3.5 w-3.5" /> Edit Journey
      </Link>
      {live ? (
        <>
          <span className={`${btn} border border-success/40 bg-success-bg font-semibold text-success`}>
            <Check className="h-3.5 w-3.5" /> Published
          </span>
          <button
            type="button"
            onClick={() => setConfirmUnpublish(true)}
            disabled={pending}
            className={`${btn} border border-border text-muted hover:bg-surface-elevated hover:text-text disabled:opacity-60`}
          >
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <EyeOff className="h-3.5 w-3.5" />}
            {pending ? 'Unpublishing…' : 'Unpublish'}
          </button>
        </>
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
            className="inline-flex items-center gap-1.5 text-body-sm text-muted"
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

      <DangerModal
        open={confirmUnpublish}
        onClose={() => setConfirmUnpublish(false)}
        title="Unpublish this Journey?"
        confirmLabel={adopterCount > 0 ? 'Unpublish anyway' : 'Unpublish'}
        onConfirm={unpublish}
        body={
          <div className="space-y-3">
            <p>
              It goes back to a draft and leaves the community library, so no one new can find or adopt
              it. You can publish it again anytime.
            </p>
            {adopterCount > 0 && (
              <div className="rounded-card border border-warning/50 bg-warning-bg p-3 text-warning">
                <p className="font-semibold">
                  {adopterCount} {adopterCount === 1 ? 'member is' : 'members are'} on this Journey right now.
                </p>
                <p className="mt-1">
                  They keep the practices they adopted, but the Journey page closes for them until you
                  publish it again.
                </p>
              </div>
            )}
          </div>
        }
      />
    </div>
  )
}
