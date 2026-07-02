'use client'

import { useState } from 'react'
import { MapPin, Check, Loader2 } from 'lucide-react'
import { setMemberLocationFromCoords } from '@/app/(main)/timezone-actions'

// The explicit "share your location to set your local timezone" prompt (TZ-01). The app
// also syncs the browser timezone silently on load (TimezoneSync), but sharing location
// here pins it precisely and powers the nearby feed. Renders the current zone and a single
// action; falls back to a clear message when the browser denies or lacks geolocation.
export function LocationTimezoneCard({ currentTimezone }: { currentTimezone: string | null }) {
  const [tz, setTz] = useState(currentTimezone)
  const [state, setState] = useState<'idle' | 'locating' | 'saving' | 'done' | 'error'>('idle')
  const [message, setMessage] = useState<string | null>(null)

  function share() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setState('error')
      setMessage('This browser can’t share a location. Your timezone still syncs automatically.')
      return
    }
    setState('locating')
    setMessage(null)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        setState('saving')
        const res = await setMemberLocationFromCoords(pos.coords.latitude, pos.coords.longitude)
        if (res.ok) {
          setTz(res.timezone)
          setState('done')
          setMessage(null)
        } else {
          setState('error')
          setMessage(res.error)
        }
      },
      () => {
        setState('error')
        setMessage('Location access was blocked. Your timezone still syncs automatically from this device.')
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 600_000 },
    )
  }

  const busy = state === 'locating' || state === 'saving'

  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-bg text-primary-strong">
          <MapPin className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-text">Your timezone</p>
          <p className="mt-0.5 text-sm text-muted">
            {tz
              ? <>Set to <span className="font-medium text-text">{tz.replace(/_/g, ' ')}</span>. Event times and your day show in this zone.</>
              : 'Share your location so event times and your day show in your local zone. Home base is Pacific.'}
          </p>
          {message && <p className="mt-1.5 text-sm text-subtle">{message}</p>}
        </div>
      </div>
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={share}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium text-text transition-colors hover:border-border-strong disabled:opacity-60"
        >
          {state === 'done' ? (
            <><Check className="h-4 w-4 text-primary-strong" /> Updated</>
          ) : busy ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> {state === 'locating' ? 'Locating' : 'Saving'}</>
          ) : (
            <><MapPin className="h-4 w-4" /> {tz ? 'Update from my location' : 'Use my location'}</>
          )}
        </button>
      </div>
    </div>
  )
}
