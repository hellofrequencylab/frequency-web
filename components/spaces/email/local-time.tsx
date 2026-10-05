'use client'

import { useEffect, useState } from 'react'

// A timestamp in the VIEWER's zone (SCAN-702). The campaign list is a server component, and a
// server-side Intl format carries the server's zone (UTC on Vercel), so an owner in Los Angeles who
// scheduled 2:30 PM read "Sends 9:30 PM" and could not tell whether the time was right. The server
// render shows the UTC reading labelled as such (a stable placeholder, so hydration matches), and the
// first client effect re-formats the same instant in the browser's zone.

const OPTIONS: Intl.DateTimeFormatOptions = {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
}

export function LocalTime({ iso }: { iso: string }) {
  const ms = new Date(iso).getTime()
  const [local, setLocal] = useState<string | null>(null)

  useEffect(() => {
    // Client-only zone read (the render stays pure); the browser's zone is the viewer's.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocal(Number.isFinite(ms) ? new Intl.DateTimeFormat('en-US', OPTIONS).format(new Date(ms)) : null)
  }, [ms])

  if (!Number.isFinite(ms)) return null
  const utc = new Intl.DateTimeFormat('en-US', { ...OPTIONS, timeZone: 'UTC' }).format(new Date(ms))
  return (
    <time dateTime={new Date(ms).toISOString()} suppressHydrationWarning>
      {local ?? `${utc} UTC`}
    </time>
  )
}
