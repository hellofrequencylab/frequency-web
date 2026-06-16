'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { DangerModal } from '@/components/admin/danger-modal'
import { isError } from '@/lib/action-result'
import { deleteJourney } from '@/app/(main)/journeys/actions'

// The author's (or an operator's) delete control, the last section of the Journey editor popup.
// Type-to-confirm; deleteJourney re-checks owner-or-admin server-side, then we close to /journeys.
export function JourneyDangerZone({ planId, title }: { planId: string; title: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()

  function remove() {
    start(async () => {
      const r = await deleteJourney(planId)
      if (!isError(r)) router.push('/journeys')
    })
  }

  return (
    <div>
      <p className="text-2xs font-semibold uppercase tracking-wide text-subtle">Danger zone</p>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={pending}
        className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-danger/30 px-3 py-2 text-sm font-medium text-danger transition-colors hover:bg-danger-bg/40 disabled:opacity-60"
      >
        <Trash2 className="h-4 w-4" /> Delete this Journey
      </button>
      <p className="mt-1.5 text-2xs text-muted">Removes the Journey and everyone&apos;s progress on it. This cannot be undone.</p>

      <DangerModal
        open={open}
        onClose={() => setOpen(false)}
        title="Delete this Journey"
        body={
          <>
            This permanently removes <span className="font-semibold text-text">{title}</span> and all its phases,
            lessons, and member progress. This cannot be undone.
          </>
        }
        confirmLabel="Delete Journey"
        requireTyping={title}
        onConfirm={remove}
      />
    </div>
  )
}
