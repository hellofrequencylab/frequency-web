'use client'

// Airwaves P1 — the "pick a Recording" control (ADR-608 §6a/§6c). Built ONCE and reused by the `recording`
// entity-block field AND the host attach UI. A single-select over the current Space's Recordings, fetched
// at edit time from the gated list route (/api/airwaves/spaces/<slug>/recordings) — the choices are the
// Space's real Recordings, not a fixed enum. The Space is read from the editor URL (/spaces/<slug>/...), so
// the control needs no seed threading. Controlled + stateless value; token-driven; voice canon (no em dashes).

import { useEffect, useMemo, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Radio } from 'lucide-react'

export interface RecordingChoice {
  id: string
  title: string
  mediaKind: 'audio' | 'video'
  durationSeconds: number | null
}

/** Pull the Space slug out of a `/spaces/<slug>/...` editor path, or null off a non-Space surface. */
function spaceSlugFromPath(pathname: string | null): string | null {
  if (!pathname) return null
  const m = /^\/spaces\/([^/]+)(?:\/|$)/.exec(pathname)
  return m ? m[1] : null
}

export function RecordingPickerControl({
  label,
  value,
  onChange,
  spaceSlug,
}: {
  label: string
  value: string
  onChange: (id: string | undefined) => void
  /** The owning Space slug. Pass it explicitly from a host editor whose URL is NOT `/spaces/<slug>/...`
   *  (a Practice / Event / Product editor); on a Space page it is derived from the path when omitted. */
  spaceSlug?: string
}) {
  const pathname = usePathname()
  const slug = useMemo(() => spaceSlug ?? spaceSlugFromPath(pathname), [spaceSlug, pathname])
  const [choices, setChoices] = useState<RecordingChoice[] | null>(null)

  useEffect(() => {
    if (!slug) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- no Space in scope: nothing to offer
      setChoices([])
      return
    }
    let live = true
    setChoices(null)
    fetch(`/api/airwaves/spaces/${encodeURIComponent(slug)}/recordings`, {
      headers: { accept: 'application/json' },
    })
      .then((r) => (r.ok ? (r.json() as Promise<{ recordings: RecordingChoice[] }>) : Promise.reject(new Error('bad'))))
      .then((d) => {
        if (live) setChoices(Array.isArray(d.recordings) ? d.recordings : [])
      })
      .catch(() => {
        if (live) setChoices([])
      })
    return () => {
      live = false
    }
  }, [slug])

  const labelCls = 'block text-2xs font-semibold uppercase tracking-wide text-subtle'

  if (choices === null) {
    return (
      <div className="space-y-1.5">
        <span className={labelCls}>{label}</span>
        <div className="h-9 animate-pulse rounded-lg border border-border bg-surface" />
      </div>
    )
  }

  if (choices.length === 0) {
    return (
      <div className="space-y-1.5">
        <span className={labelCls}>{label}</span>
        <div className="flex items-center gap-1.5 rounded-lg border border-dashed border-border px-2.5 py-2 text-2xs text-subtle">
          <Radio className="h-3.5 w-3.5" aria-hidden /> No recordings yet. Add one in Airwaves.
        </div>
      </div>
    )
  }

  return (
    <label className="block space-y-1.5">
      <span className={labelCls}>{label}</span>
      <select
        value={value || ''}
        onChange={(e) => onChange(e.target.value || undefined)}
        className="w-full rounded-lg border border-border bg-surface px-2.5 py-2 text-xs text-text outline-none focus:border-primary"
      >
        <option value="">Choose a recording</option>
        {choices.map((c) => (
          <option key={c.id} value={c.id}>
            {c.title} {c.mediaKind === 'video' ? '(video)' : '(audio)'}
          </option>
        ))}
      </select>
    </label>
  )
}
