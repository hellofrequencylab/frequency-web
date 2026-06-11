'use client'

import { Sparkles } from 'lucide-react'

// The one door on Vera's profile (ADR-238): opens the same chat panel as her
// edge tab, via the established open-vera window event.
export function AskVeraButton() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event('open-vera'))}
      className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
    >
      <Sparkles className="h-4 w-4" aria-hidden />
      Ask Vera
    </button>
  )
}
