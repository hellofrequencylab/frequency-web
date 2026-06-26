'use client'

import { Settings } from 'lucide-react'

// The event header's entry to its settings: opens the shell-level SettingsDrawer (the right-rail
// "Settings" pop-out that holds Event settings + the Layout editor) via the `open-settings` window
// event — the same seam the circle "Edit Circle" button uses. One place for every event setting.
export function EditEventButton() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event('open-settings'))}
      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-semibold text-text transition-colors hover:bg-surface-elevated"
    >
      <Settings className="h-4 w-4" /> Edit event
    </button>
  )
}
