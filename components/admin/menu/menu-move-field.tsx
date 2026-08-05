'use client'

import { Select } from '@/components/ui/select'
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
    <label className="flex items-center gap-2 text-meta font-semibold text-subtle">
      {label}
      <Select
        defaultValue=""
        disabled={disabled}
        onChange={(e) => {
          const dest = e.target.value as MenuSurfaceKey
          // Reset so the same destination can be picked again later for another row.
          e.currentTarget.value = ''
          if (dest) onMove(dest)
        }}
        emptyLabel="Another menu…"
        wrapperClassName="inline-block w-max max-w-full"
        className="font-normal"
      >
        {others.map((k) => (
          <option key={k} value={k}>
            {MENU_SURFACE_LABELS[k]}
          </option>
        ))}
      </Select>
    </label>
  )
}
