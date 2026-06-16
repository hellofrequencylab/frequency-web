'use client'

import Link from 'next/link'
import { Plus } from 'lucide-react'

// "New journey" — opens the single-page editor in DRAFT mode at /journeys/new. Nothing is created
// until the author names the Journey (ADR-301), so pushing this button never leaves an untitled
// draft behind. Uniform filled button by default, matching the other create entry points.
export function NewJourneyButton({ className, label = 'New journey' }: { className?: string; label?: string }) {
  return (
    <Link
      href="/journeys/new"
      className={
        className ??
        'inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover'
      }
    >
      <Plus className="h-4 w-4" /> {label}
    </Link>
  )
}
