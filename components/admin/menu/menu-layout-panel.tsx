'use client'

import { useState, useTransition } from 'react'
import { Columns3, RotateCcw } from 'lucide-react'
import type { ResolvedMenu } from '@/lib/menus/types'
import { ensureMenu, seedMenuFromDefaults, setMenuColumns } from '@/lib/menus/actions'
import { AdminSection } from '@/components/templates'

// The Layout & defaults panel — the `menu-layout` template block. It edits ONE slice of the active
// surface: the column count (5) and the Seed/Reset-from-site-defaults action (12). Surface-scoped:
// the wrapping block resolves the active surface (lib/menus/active-surface) and passes the surface's
// menu in, so it stays in lock-step with the picker.
//
// COUPLING — this block does NOT materialize-on-default. The empty-row→default fallback + the single
// auto-materialize live in `menu-groups` (the primary editor). Here we only ensure the menu row
// lazily on the first write (saving columns), and the Seed/Reset action seeds explicitly on demand.
// Three blocks each firing materialize would race seedMenuFromDefaults and clobber, so only the
// groups block owns it.
export function MenuLayoutPanel({
  initialMenu,
  surfaceKey,
  surfaceLabel,
}: {
  initialMenu: ResolvedMenu
  surfaceKey: ResolvedMenu['surfaceKey']
  surfaceLabel: string
}) {
  const [menuId, setMenuId] = useState<string | undefined>(initialMenu.id)
  const [isDefault, setIsDefault] = useState(initialMenu.isDefault)
  const [columns, setColumns] = useState(initialMenu.columns)
  const [columnsDraft, setColumnsDraft] = useState(String(initialMenu.columns))
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState('')
  const [isPending, startTransition] = useTransition()

  // The menu may be the code fallback (no DB id). Saving columns needs a real menu row,
  // so ensure one lazily and stamp the id locally. (Not a materialize — see the COUPLING note.)
  async function ensuredMenuId(): Promise<string | null> {
    if (menuId) return menuId
    const res = await ensureMenu(surfaceKey)
    if (!res.ok) {
      setError(res.error)
      return null
    }
    setMenuId(res.id)
    setIsDefault(false)
    return res.id
  }

  function saveColumns(next: number) {
    const clamped = Math.max(1, Math.min(12, Math.round(next)))
    const prev = columns
    setColumns(clamped)
    setColumnsDraft(String(clamped))
    setError(null)
    setStatus('Saving columns')
    startTransition(async () => {
      const id = await ensuredMenuId()
      if (!id) {
        setColumns(prev)
        setColumnsDraft(String(prev))
        return
      }
      const res = await setMenuColumns(id, clamped)
      if (res.ok) setStatus('Columns saved')
      else {
        setColumns(prev)
        setColumnsDraft(String(prev))
        setError(res.error)
        setStatus('Could not save columns')
      }
    })
  }

  function seed() {
    const verb = isDefault ? 'Seed' : 'Reset'
    if (
      !confirm(
        `${verb} "${surfaceLabel}" from the site defaults? This replaces every category, link, and rail card on this surface with today's nav. This cannot be undone.`,
      )
    )
      return
    setError(null)
    setStatus(`${verb}ing from defaults`)
    startTransition(async () => {
      const res = await seedMenuFromDefaults(surfaceKey)
      if (res.ok) {
        setStatus('Seeded from defaults. Reload to edit the new rows.')
        // The action replaced rows server-side; the simplest faithful refresh is a reload so
        // every block rehydrates from the freshly seeded DB shape.
        if (typeof window !== 'undefined') window.location.reload()
      } else {
        setError(res.error)
        setStatus('Could not seed from defaults')
      }
    })
  }

  const seedLabel = isDefault ? 'Seed from site defaults' : 'Reset from site defaults'

  return (
    <AdminSection
      title="Layout & defaults"
      description="Set how many columns this menu spreads across, then seed or reset it from today's site nav."
      actions={
        <div className="flex items-center gap-2">
          {status && (
            <span className="text-xs text-subtle" aria-hidden>
              {status}
            </span>
          )}
          <button
            type="button"
            onClick={seed}
            disabled={isPending}
            className="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-surface-elevated hover:text-text disabled:opacity-50"
          >
            <RotateCcw className="h-4 w-4 shrink-0" aria-hidden />
            {seedLabel}
          </button>
        </div>
      }
    >
      <p aria-live="polite" className="sr-only">
        {status}
      </p>
      {error && (
        <p className="mb-3 rounded-lg border border-danger/30 bg-danger-bg/40 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-end gap-4 rounded-2xl border border-border bg-surface p-4 sm:p-5">
        <div className="min-w-0">
          <label htmlFor={`cols-${surfaceKey}`} className="mb-1 flex items-center gap-2 text-xs font-semibold text-subtle">
            <Columns3 className="h-3.5 w-3.5" aria-hidden />
            Columns
          </label>
          <div className="flex items-center gap-2">
            <input
              id={`cols-${surfaceKey}`}
              type="number"
              min={1}
              max={12}
              value={columnsDraft}
              disabled={isPending}
              onChange={(e) => setColumnsDraft(e.target.value)}
              onBlur={() => {
                const n = Number(columnsDraft)
                if (Number.isFinite(n) && n !== columns) saveColumns(n)
                else setColumnsDraft(String(columns))
              }}
              className="w-24 rounded-lg border border-border bg-canvas/40 px-2.5 py-1.5 text-sm tabular-nums text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
            />
            <span className="text-xs text-subtle">1 to 12, default 6</span>
          </div>
        </div>
      </div>
    </AdminSection>
  )
}
