'use client'

import { Switch } from '@/components/ui/switch'
import { opensLabel } from '@/lib/share/short-link-stats'

// The "Shorter link" switch under a share link (LIVE-1960). Off by default: the panel shows the short
// link on Frequency's own domain, and turning this on swaps it for the freq.ie form. Hidden until the
// short code exists, so it never offers a switch that does nothing.
export function ShorterLinkSwitch({
  checked,
  onCheckedChange,
  available,
  opens,
}: {
  checked: boolean
  onCheckedChange: (v: boolean) => void
  available: boolean
  /** Opens of this link over the last 30 days; shown to the sharer only. */
  opens?: number | null
}) {
  if (!available) return null
  const label = opensLabel(opens)
  return (
    <div className="space-y-1.5">
      <label className="flex items-center justify-between gap-3 text-2xs text-muted">
        <span>Even shorter with freq.ie</span>
        <Switch checked={checked} onCheckedChange={onCheckedChange} aria-label="Use the shorter freq.ie link" />
      </label>
      {label ? <p className="text-2xs text-muted">{label}</p> : null}
    </div>
  )
}
