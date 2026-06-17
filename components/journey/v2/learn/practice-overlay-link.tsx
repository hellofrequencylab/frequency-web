'use client'

// Journeys v2 — the "open in Mindless" trigger for the practice-detail card. The detail card is a
// Server Component (it renders the write-up markdown server-side), so this tiny client island
// carries the no-navigation behaviour: it opens the global Mindless timer overlay pre-set to this
// practice (useMindless, mounted app-wide) instead of routing away. The fallback is a real link to
// the Mindless route with the practice pre-selected, so it still works if JS hasn't loaded and so
// the destination is honest. Token colors only; voice canon, no em dashes.

import { useMindless } from '@/components/on-air/mindless'
import { Play } from 'lucide-react'

export function PracticeOverlayLink({ practiceId }: { practiceId: string }) {
  const { open } = useMindless()
  return (
    <a
      href={`/on-air?practice=${practiceId}`}
      onClick={(e) => {
        // No-navigation: open the overlay in place. Cmd/Ctrl-click (new tab) still follows the href.
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
        e.preventDefault()
        open({ practiceId })
      }}
      className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
    >
      <Play className="h-4 w-4 shrink-0" aria-hidden /> Open in Mindless
    </a>
  )
}
