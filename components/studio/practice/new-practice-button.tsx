'use client'

import Link from 'next/link'
import { Plus } from 'lucide-react'
import { CrewGateButton } from '@/components/crew/upgrade-lightbox'

// "Create a practice" — opens the guided builder at /practices/new (ADR-358), the atom-level twin
// of New Journey. Vera's short Spark wizard drafts the whole Practice, then creating it makes the
// row and drops you into the full editor; nothing persists until you commit a reviewed name
// (deferred creation), so pressing this never leaves an untitled draft behind. Uniform filled
// button by default, matching New Journey and the other create entry points.
//
// Gated (ADR-414): real Crew (or a steward/staff) gets the builder link; everyone else
// gets the free-beta upgrade popup. `canCreate` defaults true so legacy mount sites are
// unchanged until they opt in.
export function NewPracticeButton({
  className,
  label = 'Create a practice',
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
    <CrewGateButton isCrew={canCreate} label={label} reason="create-practice" buttonClassName={cls}>
      <Link href="/practices/new" className={cls}>
        <Plus className="h-4 w-4" /> {label}
      </Link>
    </CrewGateButton>
  )
}
