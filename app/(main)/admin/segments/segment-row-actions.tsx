'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Pencil, Trash2 } from 'lucide-react'
import { DangerModal } from '@/components/admin/danger-modal'
import { buttonClasses } from '@/components/ui/button'
import { deleteSegment } from './actions'

// Row affordances for the segments index: edit (a link) + delete (confirm modal). Rendered
// only for editable rows — the index hides this entirely on is_system segments, so there is
// no extra guard needed here (the server action also refuses system + re-checks authz).
export function SegmentRowActions({ id, name }: { id: string; name: string }) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [pending, start] = useTransition()
  // The DangerModal closes on confirm, so surface a failed delete inline (it would
  // otherwise look like the segment was removed when it wasn't).
  const [error, setError] = useState<string | null>(null)

  function remove() {
    setError(null)
    start(async () => {
      const r = await deleteSegment(id)
      if (!r.ok) {
        setError(r.error ?? 'Could not delete the segment.')
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      <Link
        href={`/admin/segments/${id}/edit`}
        aria-label={`Edit ${name}`}
        className={buttonClasses('ghost', 'sm', 'px-2')}
      >
        <Pencil className="h-4 w-4" />
      </Link>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        disabled={pending}
        aria-label={`Delete ${name}`}
        className={buttonClasses('ghost', 'sm', 'px-2 hover:text-danger')}
      >
        <Trash2 className="h-4 w-4" />
      </button>

      <DangerModal
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Delete segment"
        body={
          <>
            This removes the saved audience <span className="font-semibold text-text">{name}</span>. Campaigns that
            already targeted it keep their record, but you can no longer pick it. This can’t be undone.
          </>
        }
        confirmLabel="Delete segment"
        onConfirm={remove}
      />

      {error && (
        <span role="alert" className="w-full text-2xs font-medium text-danger">
          {error}
        </span>
      )}
    </div>
  )
}
