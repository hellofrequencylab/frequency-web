'use client'

import Link from 'next/link'
import { Plus } from 'lucide-react'
import { CrewGateButton } from '@/components/crew/upgrade-lightbox'

// "New journey" — opens the single-page editor in DRAFT mode at /journeys/new. Nothing is created
// until the author names the Journey (ADR-301), so pushing this button never leaves an untitled
// draft behind. Uniform filled button by default, matching the other create entry points.
//
// Gated (ADR-414): real Crew (or a steward/staff) gets the builder link; everyone else
// gets the free-beta upgrade popup. `canCreate` defaults true so legacy mount sites
// (which already render only for eligible authors) are unchanged.
export function NewJourneyButton({
  className,
  label = 'New journey',
  canCreate = true,
}: {
  className?: string
  label?: string
  canCreate?: boolean
}) {
  const cls =
    className ??
    'inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover'
  return (
    <CrewGateButton isCrew={canCreate} label={label} reason="create-journey" buttonClassName={cls}>
      <Link href="/journeys/new" className={cls}>
        <Plus className="h-4 w-4" /> {label}
      </Link>
    </CrewGateButton>
  )
}
