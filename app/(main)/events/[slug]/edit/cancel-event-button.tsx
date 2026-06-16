'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Ban } from 'lucide-react'
import { DangerModal } from '@/components/admin/danger-modal'
import { cancelEvent } from '@/app/(main)/events/actions'

// Host self-cancel — the member-facing "cancel my event" the /manage page lacked. Calls the
// host-gated cancelEvent (RLS: host_id = me) behind a confirm, then returns to the event.
export function CancelEventButton({ eventId, slug, title }: { eventId: string; slug: string; title: string }) {
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const router = useRouter()

  function cancel() {
    start(async () => {
      await cancelEvent(eventId)
      router.push(`/events/${slug}`)
      router.refresh()
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-lg border border-danger/40 px-3 py-1.5 text-sm font-semibold text-danger transition-colors hover:bg-danger-bg disabled:opacity-50"
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
