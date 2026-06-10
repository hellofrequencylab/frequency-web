'use client'

import { useState, useTransition } from 'react'
import { Radio, Check, TriangleAlert, ShieldCheck } from 'lucide-react'
import { setLiveLocation } from '@/lib/connections/connection-settings-actions'
import { isError } from '@/lib/action-result'

// Live-location opt-in (ADR-186). Turning it on captures the device position ONCE
// via the browser and stores it as the member's live point; it's still only ever
// exposed at their chosen band — never as exact coordinates. Off reverts to home.
export function LiveLocationToggle({
  initialLive,
  liveUpdatedAt,
}: {
  initialLive: boolean
  liveUpdatedAt: string | null
}) {
  const [live, setLive] = useState(initialLive)
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  function persist(enabled: boolean, lat?: number, lng?: number) {
    start(async () => {
      const r = await setLiveLocation({ enabled, lat, lng })
      if (isError(r)) {
        setError(r.error)
        setLive(!enabled)
        return
      }
      setLive(enabled)
      setError(null)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    })
  }

  function toggle() {
    setError(null)
    if (live) {
      persist(false)
      return
    }
    // Turning ON — ask the browser for the current position (a permission prompt).
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setError('Your browser can’t share location.')
      return
    }
    setError(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => persist(true, pos.coords.latitude, pos.coords.longitude),
      (err) => setError(err.code === err.PERMISSION_DENIED ? 'Location permission was denied.' : 'Couldn’t get your location.'),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    )
  }

  return (
    <section className="rounded-2xl border border-border bg-surface p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-sm font-bold text-text">
            <Radio className="h-4 w-4 text-primary-strong" /> Live location
          </h2>
          <p className="mt-1 text-sm text-muted">
            Share your <em>current</em> spot instead of your home city, so nearby people and maps reflect
            where you actually are. Off by default; reverts to your home city when you turn it off.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={live}
          onClick={toggle}
          disabled={pending}
          className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
            live ? 'bg-primary' : 'bg-surface-elevated border border-border'
          }`}
        >
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${live ? 'translate-x-6' : 'translate-x-1'}`} />
        </button>
      </div>

      <div className="mt-2 min-h-[1.25rem] text-2xs">
        {pending && <span className="text-subtle">Updating…</span>}
        {saved && !pending && (
          <span className="inline-flex items-center gap-1 text-primary-strong"><Check className="h-3 w-3" /> Saved</span>
        )}
        {error && !pending && (
          <span className="inline-flex items-center gap-1 text-danger"><TriangleAlert className="h-3 w-3" /> {error}</span>
        )}
        {live && !pending && !error && liveUpdatedAt && (
          <span className="text-subtle">Live · last updated {new Date(liveUpdatedAt).toLocaleString()}</span>
        )}
      </div>

      {/* The safety write-up — the limitations of live data, said plainly. */}
      <div className="mt-3 rounded-xl border border-border bg-surface-elevated/50 p-3">
        <p className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-subtle">
          <ShieldCheck className="h-3.5 w-3.5 text-primary-strong" /> What live location does (and doesn’t) do
        </p>
        <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-muted">
          <li>• <strong className="text-text">Still never exact.</strong> Live or not, others only ever see the band you chose under “Location precision” (a fuzzed ~1-mile area or just your city). We never share precise coordinates with anyone.</li>
          <li>• <strong className="text-text">Only the people you allow.</strong> Your “Who can find me nearby” setting still applies (strangers, connections, or no one). Live location doesn’t widen who can see you.</li>
          <li>• <strong className="text-text">It can go stale.</strong> Your position updates when the app captures it, not continuously. Treat it as “roughly where I was,” not a live tracker.</li>
          <li>• <strong className="text-text">One tap off.</strong> Turn it off here, or use <strong className="text-text">Ghost mode</strong> to disappear from proximity and maps entirely, anytime.</li>
          <li>• <strong className="text-text">Share thoughtfully.</strong> Only enable it in communities and with people you trust. Sharing where you are in real time always carries some risk. When in doubt, leave it off.</li>
        </ul>
      </div>
    </section>
  )
}
