'use client'

// THE ROOM (LIVE-2395): the small pieces every Mindless screen shares, so the door, the running
// screen, the save and the reveal read as one place. Kept apart from live-stage.tsx on purpose:
// the door imports this, and the door must not pull the running screen into its chunk.

import { useEffect, useState } from 'react'

/** The orb's own colour, wide and soft, behind a takeover's content. `-z-10` keeps it above the
 *  takeover's canvas and under everything else, so it never tints a card or a notice. The host
 *  must be its own stacking context (every Mindless takeover is `fixed z-50`). */
export function RoomWash({ fill }: { fill: string }) {
  return (
    <span
      aria-hidden
      data-room-wash
      className="pointer-events-none fixed left-1/2 top-[38%] -z-10 h-[70dvh] w-[70dvh] max-w-none -translate-x-1/2 -translate-y-1/2 rounded-pill opacity-35 blur-3xl"
      style={{ background: fill }}
    />
  )
}

/** "6:42 pm" in the member's own clock and locale. */
export function endsAtLabel(now: number, remainingSec: number): string {
  return new Date(now + remainingSec * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).toLowerCase()
}

/** When a session of this length would land if it started now, kept fresh while the door is open.
 *  Null until mounted (the clock is the member's, never the server's) and for an open-ended run. */
export function useDoneBy(totalSec: number | null): string | null {
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    const read = () => setNow(Date.now())
    const first = window.setTimeout(read, 0)
    const id = window.setInterval(read, 15_000)
    return () => {
      window.clearTimeout(first)
      window.clearInterval(id)
    }
  }, [])
  return now === null || totalSec === null || totalSec <= 0 ? null : endsAtLabel(now, totalSec)
}
