'use client'

import { useState, useTransition } from 'react'
import { Eye } from 'lucide-react'
import { buttonClasses } from '@/components/ui/button'
import { previewAsSpace } from '@/app/(main)/view-as-actions'

// "View as <space>" — the per-card staff affordance on the /admin/spaces console (the page is
// already janitor-gated). Tapping it asks the previewAsSpace server action to start a preview of
// THIS specific Space and hand back where to land. The action is the authority: it gates on the
// Executive Admin (janitor) axis, resolves the Space, sets the preview cookie, and returns the href
// of that Space's owner experience (/spaces/<slug>/settings), which renders for a janitor as a
// read-only staff preview. So the janitor sees exactly what that Space sees, and can never write
// through it (every owner write stays gated on canEditProfile server-side).
//
// On success we hard-navigate to the returned href so the whole shell repaints under the preview;
// when the Space is no longer previewable, we surface the action's on-voice note inline instead of
// erroring.
//
// COPY (CONTENT-VOICE §10): "View as <name>" is plain, no narrated feelings, no em/en dashes.
export function ViewAsSpaceButton({
  spaceId,
  spaceName,
}: {
  spaceId: string
  spaceName: string
}) {
  const [note, setNote] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function start() {
    setNote(null)
    startTransition(async () => {
      const result = await previewAsSpace(spaceId)
      if (result.href) {
        window.location.assign(result.href)
        return
      }
      setNote(result.note ?? 'That space is no longer available to preview.')
    })
  }

  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <button
        type="button"
        onClick={start}
        disabled={isPending}
        aria-label={`View as ${spaceName}`}
        className={buttonClasses('secondary', 'sm')}
      >
        <Eye className="h-3.5 w-3.5" aria-hidden /> View as {spaceName}
      </button>
      {note && (
        <p className="text-xs text-muted" role="status">
          {note}
        </p>
      )}
    </div>
  )
}
