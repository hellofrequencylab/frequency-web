'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useState, useTransition } from 'react'
import { Copy, Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { isError } from '@/lib/action-result'
import {
  createWalkthrough,
  setWalkthroughActive,
  duplicateWalkthrough,
  deleteWalkthrough,
} from './actions'

// Client controls for the management list — the on/off toggle plus Edit / Duplicate /
// Delete, and the "New walkthrough" action. Each calls the marketing-gated server action
// and refreshes the list. Kept tiny: the list page is a Server Component and owns the data.

export function NewWalkthroughButton() {
  const [pending, start] = useTransition()
  return (
    <Button
      type="button"
      size="sm"
      disabled={pending}
      onClick={() => start(() => void createWalkthrough())}
    >
      <Plus className="h-4 w-4" aria-hidden /> {pending ? 'Creating…' : 'New walkthrough'}
    </Button>
  )
}

export function WalkthroughRowActions({ id, active }: { id: string; active: boolean }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [confirming, setConfirming] = useState(false)

  function toggle() {
    start(async () => {
      await setWalkthroughActive(id, !active)
      router.refresh()
    })
  }

  function duplicate() {
    start(async () => {
      const r = await duplicateWalkthrough(id)
      if (!isError(r)) router.refresh()
    })
  }

  function remove() {
    start(async () => {
      const r = await deleteWalkthrough(id)
      if (!isError(r)) {
        setConfirming(false)
        router.refresh()
      }
    })
  }

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2">
      {/* On/off toggle */}
      <button
        type="button"
        role="switch"
        aria-checked={active}
        aria-label={active ? 'Switch off' : 'Switch on'}
        disabled={pending}
        onClick={toggle}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
          active ? 'bg-success' : 'bg-surface-elevated'
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-surface shadow transition-transform ${
            active ? 'translate-x-[22px]' : 'translate-x-0.5'
          }`}
        />
      </button>

      <Button asChild variant="secondary" size="sm">
        <Link href={`/admin/walkthroughs/${id}`}>
          <Pencil className="h-3.5 w-3.5" aria-hidden /> Edit
        </Link>
      </Button>
      <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={duplicate}>
        <Copy className="h-3.5 w-3.5" aria-hidden /> Duplicate
      </Button>

      {confirming ? (
        <span className="inline-flex items-center gap-1.5">
          <Button type="button" variant="danger" size="sm" disabled={pending} onClick={remove}>
            {pending ? 'Deleting…' : 'Confirm'}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)}>
            Cancel
          </Button>
        </span>
      ) : (
        <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => setConfirming(true)}>
          <Trash2 className="h-3.5 w-3.5" aria-hidden /> Delete
        </Button>
      )}
    </div>
  )
}
