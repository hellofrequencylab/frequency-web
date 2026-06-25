'use client'

import { Settings } from 'lucide-react'

// The circle header's single entry to its settings: opens the shell-level SettingsDrawer (the
// right-rail "Settings" pop-out that holds Circle settings + Circle Quest + the Layout editor) via
// the `open-settings` window event — the same event the PageAdminBar trigger used. One place for
// every circle setting; the old separate /settings page link + the duplicate PageAdminBar Settings
// trigger are gone.
export function EditCircleButton() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event('open-settings'))}
      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-semibold text-text transition-colors hover:bg-surface-elevated"
    >
      <Settings className="h-4 w-4" /> Edit Circle
    </button>
  )
}
