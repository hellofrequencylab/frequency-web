'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

// The dock's orb (LIVE-1025). One orb for the three views of the bottom-right chat panel; its
// colour says which view you are in and it flickers while a reply is on its way. Painted by the
// Frequency theme only (`.fqd-orb` in app/themes/frequency/members-shell.css): the element ships
// `hidden`, so under DAWN it takes no space and the panel keeps its own icon square.

export type DockOrbMode = 'vera' | 'support' | 'messages'

/** Fired on `window` by whatever is waiting on a reply, so the panel's orb can flicker. */
export const DOCK_BUSY_EVENT = 'fq-dock-busy'

/** Announce that a reply is (or is no longer) arriving. Safe to call from any client component. */
export function announceDockBusy(busy: boolean): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent<boolean>(DOCK_BUSY_EVENT, { detail: busy }))
}

/** The standing "a reply is arriving" fact, subscribed from the DOM event. */
export function useDockBusy(): boolean {
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    const on = (e: Event) => setBusy((e as CustomEvent<boolean>).detail === true)
    window.addEventListener(DOCK_BUSY_EVENT, on)
    return () => window.removeEventListener(DOCK_BUSY_EVENT, on)
  }, [])
  return busy
}

export function DockOrb({ mode, busy = false, small = false }: { mode: DockOrbMode; busy?: boolean; small?: boolean }) {
  return (
    <span
      aria-hidden
      data-mode={mode}
      data-busy={busy ? 'true' : undefined}
      className={cn('fqd-orb hidden', small && 'is-sm')}
    />
  )
}
