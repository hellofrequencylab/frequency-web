'use client'

import { Switch } from '@/components/ui/switch'

// The "Shorter link" switch under a share link (LIVE-1960). Off by default: the panel shows the short
// link on Frequency's own domain, and turning this on swaps it for the freq.ie form. Hidden until the
// short code exists, so it never offers a switch that does nothing.
export function ShorterLinkSwitch({
  checked,
  onCheckedChange,
  available,
}: {
  checked: boolean
  onCheckedChange: (v: boolean) => void
  available: boolean
}) {
  if (!available) return null
  return (
    <label className="flex items-center justify-between gap-3 text-2xs text-muted">
      <span>Even shorter with freq.ie</span>
      <Switch checked={checked} onCheckedChange={onCheckedChange} aria-label="Use the shorter freq.ie link" />
    </label>
  )
}
