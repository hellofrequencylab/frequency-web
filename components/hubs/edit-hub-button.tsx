'use client'

import { Settings } from 'lucide-react'

// The hub header's entry to its settings: opens the shell-level SettingsDrawer (the right-rail
// "Settings" pop-out that holds the Hub settings module) via the `open-settings` window event —
// the same seam the circle "Edit Circle" and event "Edit event" buttons use. One place for every
// hub setting; the heavier management lives behind the "Manage hub" console link.
export function EditHubButton() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event('open-settings'))}
      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-semibold text-text transition-colors hover:bg-surface-elevated"
    >
      <Settings className="h-4 w-4" /> Edit hub
    </button>
  )
}
