'use client'

import { useState, useTransition } from 'react'
import { Copy, Rocket, Undo2, Trash2 } from 'lucide-react'
import {
  setSequenceStatusAction,
  duplicateSequenceAction,
  deleteSequenceVersionAction,
} from './builder-actions'

// Per-row lifecycle controls for one custom Splash funnel, split out so Delete can
// confirm first and every action shows a pending state. The reads + the Edit/Preview
// links stay in the server component; only these mutations need client interactivity.

const BTN =
  'inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold text-muted transition-colors hover:bg-surface-elevated hover:text-text disabled:opacity-50'

export function FunnelRowActions({
  slug,
  status,
}: {
  slug: string
  status: 'draft' | 'published'
}) {
  const [isPending, startTransition] = useTransition()
  const [confirming, setConfirming] = useState(false)
  const published = status === 'published'

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <button
        type="button"
        disabled={isPending}
        onClick={() =>
          startTransition(() =>
            setSequenceStatusAction(slug, published ? 'draft' : 'published'),
          )
        }
        className={BTN}
        title={published ? 'Take this funnel offline' : 'Make this funnel live'}
      >
        {published ? (
          <>
            <Undo2 className="h-3.5 w-3.5" /> Unpublish
          </>
        ) : (
          <>
            <Rocket className="h-3.5 w-3.5" /> Publish
          </>
        )}
      </button>

      <button
        type="button"
        disabled={isPending}
        onClick={() => startTransition(() => duplicateSequenceAction(slug))}
        className={BTN}
        title="Make a draft copy of this funnel"
      >
        <Copy className="h-3.5 w-3.5" /> Duplicate
      </button>

      {confirming ? (
        <span className="inline-flex items-center gap-1.5">
          <button
            type="button"
            disabled={isPending}
            onClick={() => startTransition(() => deleteSequenceVersionAction(slug))}
            className="inline-flex items-center gap-1 rounded-lg bg-danger px-2.5 py-1.5 text-xs font-semibold text-on-primary transition-colors hover:opacity-90 disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" /> Confirm
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => setConfirming(false)}
            className="text-xs font-semibold text-muted transition-colors hover:text-text"
          >
            Cancel
          </button>
        </span>
      ) : (
        <button
          type="button"
          disabled={isPending}
          onClick={() => setConfirming(true)}
          className={`${BTN} hover:bg-danger-bg hover:text-danger`}
          title="Delete this funnel"
        >
          <Trash2 className="h-3.5 w-3.5" /> Delete
        </button>
      )}
    </div>
  )
}
