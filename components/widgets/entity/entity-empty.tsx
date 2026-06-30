import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import { Plus } from 'lucide-react'
import { getActiveSpace } from '@/lib/spaces/active-space'
import { spaceManageHref } from '@/lib/spaces/types'
import { spaceProfileIsEmpty, viewerCanEditActiveSpace } from '@/lib/spaces/profile-presence'
import { EmptyState } from '@/components/ui/empty-state'
import { buttonClasses } from '@/components/ui/button'

// SHARED entity-section empty (ENTITY-SPACES §A.3 / §3). One place decides how a profile section's
// "nothing yet" reads, so every tab is consistent:
//
//   • If the WHOLE profile is empty → render NOTHING. The single composite "getting started" empty
//     (entity-getting-started, placed first on every browse tab) carries the page instead of this
//     section stacking another dashed box under it.
//   • Else (the profile has content, just not in THIS section) → show the empty. For an OWNER it is
//     ACTIONABLE (the `action` prop, an "Add …" CTA into the management hub); for a member it stays
//     the quiet "check back" voice.

export async function EntitySectionEmpty({
  icon,
  title,
  description,
  ownerTitle,
  ownerActionLabel,
}: {
  icon: LucideIcon
  /** The member-facing copy: names the situation + the next step, quiet voice. */
  title: string
  description: string
  /** The owner-facing headline (actionable). Falls back to `title` when omitted. */
  ownerTitle?: string
  /** The owner CTA label, e.g. "Add your first session". When omitted no action shows. */
  ownerActionLabel?: string
}) {
  const space = getActiveSpace()
  if (!space) return null

  // The composite "getting started" empty owns the totally-empty case (it leads every browse tab).
  if (await spaceProfileIsEmpty()) return null

  const canEdit = await viewerCanEditActiveSpace()
  // The management entry (ADR-441 EM1-3): the unified /manage console for the console types, the
  // legacy /settings hub otherwise. One rule, one helper.
  const settingsHref = spaceManageHref(space.type, space.slug)

  if (canEdit && ownerActionLabel) {
    return (
      <EmptyState
        icon={icon}
        title={ownerTitle ?? title}
        description="Add it from your management hub and it shows up here."
        action={
          <Link href={settingsHref} className={buttonClasses('primary', 'sm')}>
            <Plus className="h-3.5 w-3.5" aria-hidden />
            {ownerActionLabel}
          </Link>
        }
      />
    )
  }

  return <EmptyState icon={icon} title={title} description={description} />
}
