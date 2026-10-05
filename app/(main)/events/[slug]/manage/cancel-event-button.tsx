'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Ban } from 'lucide-react'
import { DangerModal } from '@/components/admin/danger-modal'
import { cancelEvent } from '@/app/(main)/events/actions'

// Host self-cancel — the member-facing "cancel my event". It sat on /events/[slug]/edit until
// LIVE-237 retired that route; it now renders in the Manage hub's Settings tab beside the rail
// (event-danger-zone.tsx). Calls the host-gated cancelEvent (RLS: host_id = me) behind a confirm,
// then returns to the event. A refusal or a failed write stays here and says so (SCAN-700).
export function CancelEventButton({ eventId, slug, title }: { eventId: string; slug: string; title: string }) {
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  function cancel() {
    setError(null)
    start(async () => {
      const res = await cancelEvent(eventId)
      if (res?.error) {
        setError(res.error)
        return
      }
      router.push(`/events/${slug}`)
      router.refresh()
    })
  }

  return (
    <>
      {error && (
        <p role="alert" className="mb-2 text-meta text-danger">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-control border border-danger/40 px-3 py-1.5 text-body-sm font-semibold text-danger transition-colors hover:bg-danger-bg disabled:opacity-50"
      >
        <Ban className="h-4 w-4" />
        {pending ? 'Cancelling…' : 'Cancel event'}
      </button>
      <DangerModal
        open={open}
        onClose={() => setOpen(false)}
        title="Cancel event"
        body={
          <>
            This marks <span className="font-semibold text-text">{title}</span> as cancelled for
            everyone. You can&apos;t undo this from here.
          </>
        }
        confirmLabel="Cancel event"
        onConfirm={cancel}
      />
    </>
  )
}
