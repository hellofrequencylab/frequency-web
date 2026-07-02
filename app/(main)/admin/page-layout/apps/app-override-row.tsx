'use client'

import { useState, useTransition } from 'react'
import { RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { isError } from '@/lib/action-result'
import { APP_MIN_ROLES, type AppMinRole } from '@/lib/apps/overrides'
import { setAppOverride, clearAppOverride } from '@/app/(main)/admin/page-layout/app-actions'

// One editable row of the Apps manager: a catalog App at the chosen scope, with an enable toggle, a
// position control, and a min-role floor select. Autosave with visible state, matching the Chrome
// manager's RouteChromeRow (ADMIN-DESIGN-SYSTEM §5). The server page owns the data; this island only
// mutates + reflects. DAWN tokens only; voice canon (no em dashes).

const ROLE_LABEL: Record<AppMinRole, string> = {
  host: 'Hosts and up',
  guide: 'Guides and up',
  mentor: 'Mentors only',
}

interface RowState {
  enabled: boolean
  position: string
  minRole: AppMinRole | ''
}

export function AppOverrideRow({
  scopeKey,
  appId,
  label,
  catalogIndex,
  initial,
}: {
  scopeKey: string
  appId: string
  label: string
  /** The App's default order in the catalog, shown as the placeholder when no position is pinned. */
  catalogIndex: number
  /** The saved override, or null to follow the catalog default. */
  initial: { enabled: boolean; position: number | null; minRole: AppMinRole | null } | null
}) {
  const [state, setState] = useState<RowState>({
    enabled: initial?.enabled ?? true,
    position: initial?.position != null ? String(initial.position) : '',
    minRole: initial?.minRole ?? '',
  })
  const [overridden, setOverridden] = useState(initial !== null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [isPending, startTransition] = useTransition()

  function commit(next: RowState) {
    setState(next)
    setError(null)
    setSaved(false)
    startTransition(async () => {
      const r = await setAppOverride(scopeKey, appId, {
        enabled: next.enabled,
        position: next.position.trim() === '' ? null : Number(next.position),
        minRole: next.minRole === '' ? null : next.minRole,
      })
      if (isError(r)) setError(r.error)
      else {
        setOverridden(true)
        setSaved(true)
      }
    })
  }

  function reset() {
    setError(null)
    setSaved(false)
    startTransition(async () => {
      const r = await clearAppOverride(scopeKey, appId)
      if (isError(r)) setError(r.error)
      else {
        setOverridden(false)
        setState({ enabled: true, position: '', minRole: '' })
      }
    })
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-bold text-text">{label}</span>
          {overridden && (
            <span className="shrink-0 rounded-full bg-broadcast-bg px-2 py-0.5 text-2xs font-semibold text-broadcast-strong">
              Override
            </span>
          )}
          {!state.enabled && (
            <span className="shrink-0 rounded-full border border-border bg-canvas px-2 py-0.5 text-2xs font-semibold text-muted">
              Hidden
            </span>
          )}
        </div>
        <code className="mt-0.5 block truncate text-xs text-subtle">{appId}</code>
        {error && <p className="mt-1 text-xs text-danger">{error}</p>}
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-3">
        <span className="text-2xs text-subtle tabular-nums" aria-live="polite">
          {isPending ? 'Saving…' : saved ? 'Saved' : overridden ? '' : 'Catalog default'}
        </span>

        <label className="flex items-center gap-1.5 text-xs font-medium text-muted">
          <input
            type="checkbox"
            checked={state.enabled}
            disabled={isPending}
            onChange={(e) => commit({ ...state, enabled: e.target.checked })}
            className="h-4 w-4 rounded border-border text-primary-strong"
          />
          Shown
        </label>

        <label className="flex items-center gap-1.5 text-xs font-medium text-muted">
          <span className="sr-only sm:not-sr-only">Order</span>
          <input
            type="number"
            inputMode="numeric"
            value={state.position}
            placeholder={String(catalogIndex)}
            disabled={isPending}
            aria-label={`Order for ${label}`}
            onChange={(e) => setState((s) => ({ ...s, position: e.target.value }))}
            onBlur={() => commit(state)}
            className="w-16 rounded-lg border border-border bg-canvas px-2 py-1.5 text-sm text-text disabled:opacity-50"
          />
        </label>

        <label className="flex items-center gap-1.5 text-xs font-medium text-muted">
          <span className="sr-only sm:not-sr-only">Who sees it</span>
          <select
            value={state.minRole}
            disabled={isPending}
            aria-label={`Who sees ${label}`}
            onChange={(e) => commit({ ...state, minRole: e.target.value as AppMinRole | '' })}
            className="rounded-lg border border-border bg-canvas px-2.5 py-1.5 text-sm font-medium text-text disabled:opacity-50"
          >
            <option value="">Everyone</option>
            {APP_MIN_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </label>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={isPending || !overridden}
          onClick={reset}
          title={overridden ? 'Reset to the catalog default' : 'No override to reset'}
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Reset
        </Button>
      </div>
    </div>
  )
}
