'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronUp, ChevronDown } from 'lucide-react'
import { Toggle } from '@/components/admin/toggle'
import { isError } from '@/lib/action-result'
import {
  setTemplateActive,
  reorderTemplate,
} from '@/app/(main)/admin/circle-templates/actions'

// Per-row controls for the Circle Templates index. Both are client islands because the
// DataTable renders its cells on the SERVER (passing an onClick across the boundary
// would throw) — so each interactive control is its own 'use client' leaf. The server
// re-checks operator access on every call and is authoritative.

/** The per-template `is_active` switch shown inline in the Active column. */
export function ActiveToggle({ id, active }: { id: string; active: boolean }) {
  const router = useRouter()
  const [on, setOn] = useState(active)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [, start] = useTransition()

  function flip(next: boolean) {
    setOn(next) // optimistic
    setSaveState('saving')
    start(async () => {
      const res = await setTemplateActive(id, next)
      if (isError(res)) {
        setOn(!next) // roll back
        setSaveState('idle')
        return
      }
      setSaveState('saved')
      router.refresh()
      setTimeout(() => setSaveState('idle'), 1200)
    })
  }

  return <Toggle checked={on} onChange={flip} ariaLabel="Template active" saveState={saveState} />
}

/** Up/down reorder, swapping display_order with the neighbor. Edge moves no-op. */
export function ReorderControls({
  id,
  isFirst,
  isLast,
}: {
  id: string
  isFirst: boolean
  isLast: boolean
}) {
  const router = useRouter()
  const [pending, start] = useTransition()

  function move(direction: 'up' | 'down') {
    start(async () => {
      await reorderTemplate(id, direction)
      router.refresh()
    })
  }

  return (
    <div className="inline-flex items-center gap-0.5">
      <button
        type="button"
        onClick={() => move('up')}
        disabled={pending || isFirst}
        aria-label="Move up"
        className="rounded-md p-1 text-muted transition-colors hover:bg-surface-elevated hover:text-text disabled:cursor-not-allowed disabled:opacity-30"
      >
        <ChevronUp className="h-4 w-4" aria-hidden />
      </button>
      <button
        type="button"
        onClick={() => move('down')}
        disabled={pending || isLast}
        aria-label="Move down"
        className="rounded-md p-1 text-muted transition-colors hover:bg-surface-elevated hover:text-text disabled:cursor-not-allowed disabled:opacity-30"
      >
        <ChevronDown className="h-4 w-4" aria-hidden />
      </button>
    </div>
  )
}
