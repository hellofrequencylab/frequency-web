'use client'

import { useId, useState, type ReactNode } from 'react'
import { Nfc } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'

// THE CHECK IN BUTTON on a Space's cover, top right. Activated (the Space turned badge check-in on):
// the kit's illuminated `.btn.pa`, and a tap opens the badge panel (what to tap, or how to get a card).
// Not activated: the same pill in the kit's disabled look, still focusable so the reason reads on hover
// and to a screen reader. The panel is server-rendered by components/spaces/badge-note.tsx and passed in.
export function CheckinButton({ activated, children }: { activated: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const titleId = useId()
  if (!activated) {
    return (
      <button type="button" className="btn fqs-frost" aria-disabled="true" title="This Space has not turned on badge check-in yet.">
        <Nfc aria-hidden />
        Check In
      </button>
    )
  }
  return (
    <>
      <button type="button" className="btn pa" onClick={() => setOpen(true)}>
        <Nfc aria-hidden />
        Check In
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} ariaLabelledBy={titleId} className="max-w-md" align="center">
        <div className="rounded-card border border-border bg-surface p-5 text-text">
          <h2 id={titleId} className="text-display-h3">
            Check in with your badge
          </h2>
          <div className="mt-3 flex flex-col gap-3 text-body-sm">{children}</div>
          <div className="mt-4 flex justify-end">
            <button type="button" className="btn sm" onClick={() => setOpen(false)}>
              Done
            </button>
          </div>
        </div>
      </Dialog>
    </>
  )
}
