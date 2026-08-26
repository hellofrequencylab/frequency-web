'use client'

import { useEffect, useState } from 'react'
import { UpgradeLightbox, UPGRADE_COPY } from './upgrade-lightbox'

// THE APP-WIDE UPGRADE PROMPT. Mounts the upgrade lightbox ONCE and opens it on the `open-upgrade`
// window event, so any surface that discovers a member is reaching past their scope just says so:
//
//   openUpgrade('create-circle')
//
// It is the same shape as `SupportLauncher` (components/support/support-launcher.tsx) and the capture
// / invite launchers beside it in the shell: one dialog, many callers, no prop drilling.
//
// 🔴 WHY IT IS CENTRAL NOW. Every gate used to own a private copy: `CrewGate` and `CrewGateButton`
// each held their own `useState` and rendered their own `<UpgradeLightbox>`, at nine call sites. So
// the prompt existed nine times, could only ever be opened by a component that had already decided to
// render a gate, and nothing outside that set could raise it at all - a rejected server action, a
// meter that hit its cap, a nav item a member cannot use. The dialog is a piece of app chrome, not a
// piece of a button.
//
// The event carries a `reason` that keys into UPGRADE_COPY for tailored copy; an unknown or absent
// reason falls back to the default Quest pitch, so a caller can never open an empty dialog.

/** The window event any surface dispatches to raise the upgrade prompt. */
const OPEN_EVENT = 'open-upgrade'

export function UpgradeLauncher() {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState<string | undefined>(undefined)
  // Bumped on each open so the dialog REMOUNTS fresh, matching SupportLauncher: a second gate opening
  // it must not inherit the first one's closing animation.
  const [seq, setSeq] = useState(0)

  useEffect(() => {
    const onOpen = (e: Event) => {
      const r = (e as CustomEvent).detail?.reason
      setReason(typeof r === 'string' ? r : undefined)
      setSeq((s) => s + 1)
      setOpen(true)
    }
    window.addEventListener(OPEN_EVENT, onOpen)
    return () => window.removeEventListener(OPEN_EVENT, onOpen)
  }, [])

  if (!open) return null
  const copy = reason ? UPGRADE_COPY[reason] : undefined
  return <UpgradeLightbox key={seq} open onClose={() => setOpen(false)} title={copy?.title} blurb={copy?.blurb} />
}

/** Raise the upgrade prompt from anywhere. `reason` keys into UPGRADE_COPY to tailor the copy to what
 *  the member just reached for; omit it for the general pitch.
 *
 *  Safe to call from an event handler on any client surface. It is a no-op on the server. */
export function openUpgrade(reason?: string): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: { reason } }))
}
