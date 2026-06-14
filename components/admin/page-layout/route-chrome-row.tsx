'use client'

import { useState, useTransition } from 'react'
import { RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { isError } from '@/lib/action-result'
import type { Rail } from '@/lib/layout/page-chrome'
import { setRouteChrome, clearRouteChrome } from '@/app/(main)/admin/page-layout/actions'

// One editable row of the Page layout manager: a route, a rail picker (Global / Scoped /
// No rail), and a Reset that drops the override back to the code default. The page is a
// Server Component and owns the data; this island only mutates + reflects the change.
// Save semantics match the Menu manager — picking a rail saves immediately and the row
// shows a quiet "Saved"/"Saving…" status (ADMIN-DESIGN-SYSTEM §5: toggles/imperative
// autosave with visible state).

const RAIL_OPTIONS: { value: Rail; label: string }[] = [
  { value: 'global', label: 'Global rail' },
  { value: 'scoped', label: 'Scoped rail' },
  { value: 'none', label: 'No rail' },
]

export function RouteChromeRow({
  route,
  label,
  codeRail,
  initialOverride,
}: {
  route: string
  label: string
  /** The code default (railFor) — shown as the fallback when there is no override. */
  codeRail: Rail
  /** The saved override for this route, or null to follow the code default. */
  initialOverride: Rail | null
}) {
  const [override, setOverride] = useState<Rail | null>(initialOverride)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [isPending, startTransition] = useTransition()

  // The select reflects the EFFECTIVE rail: the override if set, else the code default.
  const effective: Rail = override ?? codeRail
  const isOverridden = override !== null

  function pick(rail: Rail) {
    setError(null)
    setSaved(false)
    const prev = override
    setOverride(rail)
    startTransition(async () => {
      const r = await setRouteChrome(route, rail)
      if (isError(r)) {
        setOverride(prev)
        setError(r.error)
      } else {
        setSaved(true)
      }
    })
  }

  function reset() {
    setError(null)
    setSaved(false)
    const prev = override
    setOverride(null)
    startTransition(async () => {
      const r = await clearRouteChrome(route)
      if (isError(r)) {
        setOverride(prev)
        setError(r.error)
      }
    })
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-bold text-text">{label}</span>
          {isOverridden && (
            <span className="shrink-0 rounded-full bg-broadcast-bg px-2 py-0.5 text-2xs font-semibold text-broadcast-strong">
              Override
            </span>
          )}
        </div>
        <code className="mt-0.5 block truncate text-xs text-subtle">{route}</code>
        {error && <p className="mt-1 text-xs text-danger">{error}</p>}
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <span className="text-2xs text-subtle tabular-nums" aria-live="polite">
          {isPending ? 'Saving…' : saved ? 'Saved' : isOverridden ? '' : `Default: ${codeRail}`}
        </span>

        <label className="sr-only" htmlFor={`rail-${route}`}>
          Rail for {label}
        </label>
        <select
          id={`rail-${route}`}
          value={effective}
          disabled={isPending}
          onChange={(e) => pick(e.target.value as Rail)}
          className="rounded-lg border border-border bg-canvas px-2.5 py-1.5 text-sm font-medium text-text disabled:opacity-50"
        >
          {RAIL_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={isPending || !isOverridden}
          onClick={reset}
          title={isOverridden ? 'Reset to the code default' : 'No override to reset'}
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Reset
        </Button>
      </div>
    </div>
  )
}
