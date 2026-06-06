'use client'

import { useEffect, useState } from 'react'
import { ReportDialog } from './report-dialog'
import type { TicketType } from '@/lib/support/types'

// Mounts the report dialog once, app-wide, and opens it on the `open-support` window
// event. Any "Report a bug / Get help" affordance anywhere (the account menu, the
// Vera chat box, a page button) just dispatches that event — no prop drilling.
//   window.dispatchEvent(new CustomEvent('open-support', { detail: { type: 'bug' } }))
export function SupportLauncher() {
  const [open, setOpen] = useState(false)
  const [type, setType] = useState<TicketType>('bug')
  // Bumped on each open so the dialog REMOUNTS fresh (clean form + a new context
  // capture) — avoids a reset-on-open effect.
  const [seq, setSeq] = useState(0)

  useEffect(() => {
    const onOpen = (e: Event) => {
      const t = (e as CustomEvent).detail?.type as TicketType | undefined
      setType(t ?? 'bug')
      setSeq((s) => s + 1)
      setOpen(true)
    }
    window.addEventListener('open-support', onOpen)
    return () => window.removeEventListener('open-support', onOpen)
  }, [])

  if (!open) return null
  return <ReportDialog key={seq} open onClose={() => setOpen(false)} defaultType={type} />
}

/** Dispatch from anywhere to open the report dialog. */
export function openSupport(type: TicketType = 'bug') {
  window.dispatchEvent(new CustomEvent('open-support', { detail: { type } }))
}
