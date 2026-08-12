'use client'

// One unfinished captured event, on the SAME list as a pending proposal and a staged wizard
// draft (owner ruling 2026-08-12, "fold /events/drafts into /drafts as a third row kind").
//
// THE THIRD KIND, NOT A SPECIAL CASE. A poster a member photographed on a lamppost becomes an
// event draft that nobody has posted yet, which is the same sentence as the other two rows:
// something started, not finished, waiting on the member. It shipped as its own surface at
// /events/drafts titled "My drafts" while /drafts also said Drafts about different things, so a
// member with a captured poster and a half-typed Journey had two unrelated Drafts pages reached
// from different places. One list, one badge per kind, told apart the way the other two are.
//
// The client half is deliberately dumb, exactly like DraftRow and UnfinishedDraftRow: it renders
// what the server read and hands its one destructive decision to a server action that re-derives
// the caller from the session. The two-tap arm on the old surface is gone; a ghost "Bin it"
// beside the primary control is the grammar this list already speaks.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarDays, ScanLine, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { RowCard } from '@/components/cards/row-card'
import { binEventDraftAction } from './actions'

export interface EventDraftView {
  id: string
  title: string
  /** A short-lived signed URL for the cover crop or the poster itself. Null when there is none. */
  thumbUrl: string | null
  /** "Sat, Sep 6", or the plain no-date line. */
  whenLabel: string
  location: string | null
}

export function EventDraftRow({ draft }: { draft: EventDraftView }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function bin() {
    setError(null)
    start(async () => {
      const gone = await binEventDraftAction(draft.id)
      if (!gone) {
        setError('That did not clear. Try again in a moment.')
        return
      }
      router.refresh()
    })
  }

  return (
    <li>
      <RowCard
        href={`/events/drafts/${draft.id}`}
        anchor={
          draft.thumbUrl ? (
            // Signed URLs are short-lived, so this stays a plain img like every other
            // private-bucket preview.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={draft.thumbUrl}
              alt=""
              className="h-12 w-12 rounded-control border border-border object-cover"
            />
          ) : (
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-bg text-primary-strong">
              <CalendarDays className="h-5 w-5" aria-hidden />
            </span>
          )
        }
        title={draft.title}
        badge={
          <span className="inline-flex items-center gap-1 rounded-pill bg-surface-elevated px-2 py-0.5 text-2xs font-semibold uppercase tracking-wide text-muted">
            <ScanLine className="h-3 w-3" aria-hidden />
            You captured this
          </span>
        }
        context={draft.whenLabel}
        description={
          draft.location
            ? `${draft.location}. Nobody can see it until you post it.`
            : 'Nobody can see it until you post it.'
        }
        footer={
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="primary"
                size="sm"
                disabled={pending}
                onClick={() => router.push(`/events/drafts/${draft.id}`)}
              >
                Tidy it up and post it
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={bin}
                disabled={pending}
                className="ml-auto"
              >
                <Trash2 className="h-4 w-4" aria-hidden />
                Bin it
              </Button>
            </div>
            {error && (
              <p role="status" className="mt-2 text-body-sm text-danger">
                {error}
              </p>
            )}
          </>
        }
      />
    </li>
  )
}
