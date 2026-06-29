'use client'

import { Pencil } from 'lucide-react'

// The ONE edit affordance for a practice (ADR-450, the unified "One Edit" model). Opens the
// shell-level Inspector rail (SettingsDrawer) via the `open-settings` window event — the single
// entry that holds quick settings + "Open full editor" (the deep guide/cadence/pillar/tags +
// build-with-Vera surface). Replaces the former duplicate entry points (a header "Edit practice"
// AND a separate action-row link / staff button straight to the full studio).
export function EditPracticeButton() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event('open-settings'))}
      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-semibold text-text transition-colors hover:bg-surface-elevated"
    >
      <Pencil className="h-4 w-4" /> Edit
    </button>
  )
}
