'use client'

import { useState, useTransition } from 'react'
import { Trash2 } from 'lucide-react'
import { deleteListingIntake } from './actions'

// The one client island on a seed card: deleting a seed deserves a quiet confirm, and
// window.confirm needs the client (the same shape as the channel manage RemoveCircleButton).
// Mounted in EntityCard's `action` slot, so it floats top-right and handles its own click
// without nesting a control inside the card's anchor. deleteListingIntake re-gates on
// structure/write, best-effort removes the staged photos, and revalidates the console list.
export function DeleteIntakeButton({ intakeId }: { intakeId: string }) {
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  return (
    <span className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => {
          if (!window.confirm('Delete this seed? Its draft and staged photos go too. This cannot be undone.')) return
          setErr(null)
          start(async () => {
            const res = await deleteListingIntake(intakeId)
            if (!res.ok) setErr(res.error)
          })
        }}
        disabled={pending}
        aria-label="Delete this seed"
        title="Delete this seed"
        className="rounded-control p-1.5 text-muted transition-colors hover:text-danger disabled:opacity-40"
      >
        <Trash2 className="h-4 w-4" aria-hidden />
      </button>
      {err && <span className="max-w-40 text-right text-2xs text-danger">{err}</span>}
    </span>
  )
}
