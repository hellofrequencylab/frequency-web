// Server-safe: composes only <Link>, so it stays in the server tree.
import Link from 'next/link'
import { Plus } from 'lucide-react'

// "New journey" — opens the single-page editor in DRAFT mode at /journeys/new. Nothing is created
// until the author names the Journey (ADR-301), so pushing this button never leaves an untitled
// draft behind. Uniform filled button by default, matching the other create entry points.
//
// Ungated (ADR-920): drafting a Journey joined FIRST ONE FREE (ADR-908/838) — any signed-in
// member builds, and the free limit is the journey_publish meter at the publish gate. So
// `canCreate` now only distinguishes SIGNED-IN (the builder) from signed-out (a sign-in door);
// the old Crew upgrade popup on this button sold a paid tier for a free capability.
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
    'inline-flex items-center gap-1.5 rounded-control bg-primary px-4 py-2 text-body-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover'
  const href = canCreate ? '/journeys/new' : '/sign-in?next=/journeys/new'
  return (
    <Link href={href} className={cls}>
      <Plus className="h-4 w-4" /> {label}
    </Link>
  )
}
