'use client'

import type { MenuSurfaceKey } from '@/lib/menus/types'
import { MENU_SURFACE_LABELS } from './known-routes'

// The "menu selector" (ADR-390 — "put any page anywhere"): a small dropdown that moves
// THIS link or group to another container. Picking a destination calls the parent's
// onMove, which runs the moveItem / moveCategory server action and drops the row from the
// current surface (it now lives at the top of the destination, ready to organize there).

const ORDER: readonly MenuSurfaceKey[] = ['header', 'left', 'footer', 'profile']

export function MenuMoveField({
  current,
  onMove,
  disabled,
  label = 'Move to',
}: {
  /** The surface this row currently lives in (excluded from the options). */
  current: MenuSurfaceKey
  onMove: (dest: MenuSurfaceKey) => void
  disabled?: boolean
  label?: string
}) {
  const others = ORDER.filter((k) => k !== current)
  return (
    <label className="flex items-center gap-2 text-xs font-semibold text-subtle">
      {label}
      <select
        defaultValue=""
        disabled={disabled}
        onChange={(e) => {
          const dest = e.target.value as MenuSurfaceKey
          // Reset so the same destination can be picked again later for another row.
          e.currentTarget.value = ''
          if (dest) onMove(dest)
        }}
        className="rounded-lg border border-border bg-canvas/40 px-2.5 py-1.5 text-sm font-normal text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
      >
        <option value="">Another menu…</option>
        {others.map((k) => (
          <option key={k} value={k}>
            {MENU_SURFACE_LABELS[k]}
          </option>
        ))}
      </select>
    </label>
  )
}
