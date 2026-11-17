'use client'

import { use, useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { LaunchPill, LaunchSheet } from '@/components/frequency/members/shell/launch-box'
import type { LaunchBoxView } from '@/lib/launch/box-state'

// THE LAUNCH BOX IN THE CONSOLE TOP BAR (LIVE-2320). On a console route the members header steps aside
// (members-shell.css `[data-console]`), and the "Finish setup" / "Your launch" pill went with it, so an
// owner on Manage, Marketing or Offerings lost it. This draws the SAME pill and sheet (launch-box.tsx) from
// the SAME loader (lib/launch/box.ts loadLaunchBox), in the console's own top bar. Nothing while there is
// no launch. Small client island: the view arrives as a promise from the Server Component shell.

const SHEET_ID = 'ad-launch'

export function ConsoleLaunch({ launch }: { launch: Promise<LaunchBoxView | null> }) {
  const view = use(launch)
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLSpanElement>(null)
  const pathname = usePathname() ?? ''
  // A row in the sheet changes the route: close on the new page, the members header's render-time reset.
  const [lastPath, setLastPath] = useState(pathname)
  if (lastPath !== pathname) {
    setLastPath(pathname)
    setOpen(false)
  }

  // Escape and a click outside close it.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const onDown = (e: PointerEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onDown)
    }
  }, [open])

  if (!view) return null
  return (
    <span className="ad-launch" ref={wrap}>
      <LaunchPill view={view} open={open} onToggle={() => setOpen((o) => !o)} controls={SHEET_ID} />
      <span className="ad-launch-sheets">
        <div
          className={open ? 'ap-sheet fqm-launch on' : 'ap-sheet fqm-launch'}
          id={SHEET_ID}
          role="dialog"
          aria-label={view.setup ? 'Finish setup' : 'Your launch'}
          aria-hidden={!open}
          inert={!open}
        >
          {open && <LaunchSheet view={view} onClose={() => setOpen(false)} />}
        </div>
      </span>
    </span>
  )
}
