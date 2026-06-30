import { Suspense } from 'react'
import Link from 'next/link'
import { Building2, Users, Settings2, Crown } from 'lucide-react'
import { IndexTemplate } from '@/components/templates'
import { buttonClasses } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { EntityCard } from '@/components/cards/entity-card'
import { getMyProfileId } from '@/lib/auth'
import { listOperatedSpaces, type OperatedSpace } from '@/lib/spaces/operated'
import { spaceTypeLabel } from '@/components/spaces/space-type'

// "Spaces you run" — the operator's FRONT DOOR to the Spaces they own or admin (the hub the
// operator-context switcher links to as "Manage your spaces"). Distinct from /spaces/directory
// (browse the whole network) and /admin/spaces (the platform-wide operator table): this is the
// person's OWN set, each card opening that Space's /manage console.
//
// Composed, not authored (PAGE-FRAMEWORK §3): the Index template provides the header grammar and
// each Space renders through the shared EntityCard. The list is naturally scoped to the Spaces the
// caller operates (listOperatedSpaces re-derives ownership + active-admin membership from the DB),
// so the gate is simply "signed in". FRAMING note: this hub reads the operator set from real
// authority, never from the context cookie.

export const metadata = {
  title: 'Spaces you run',
  description: 'Open the management console for any Space you own or help run.',
}

// A dimension-matched skeleton grid — same shape/spacing as the real card grid, so the streamed
// grid lands with no layout shift (PAGE-FRAMEWORK §5.4).
function GridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-6 @lg:grid-cols-2 @2xl:grid-cols-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-40 rounded-2xl" />
      ))}
    </div>
  )
}

/** The brand anchor: the Space's logo (a plain <img>, like BrandMark/SpaceCard — an arbitrary
 *  operator URL), or a neutral building chip fallback. Decorative (alt=""): the card title carries
 *  the name, so the anchor is not announced twice. */
function SpaceAnchor({ logoUrl }: { logoUrl: string | null }) {
  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- operator-supplied Space logo URL, not a build-time asset (matches BrandMark / SpaceCard)
      <img
        src={logoUrl}
        alt=""
        className="h-11 w-11 rounded-xl border border-border bg-surface object-contain"
      />
    )
  }
  return (
    <span
      className="flex h-11 w-11 items-center justify-center rounded-xl bg-surface-elevated text-subtle"
      aria-hidden
    >
      <Building2 className="h-5 w-5" />
    </span>
  )
}

/** One "space you run" card — a thin composition of the shared EntityCard, linking to that Space's
 *  /manage console. The type badge + an owner/admin marker + a member count read in the meta row. */
function OperatedSpaceCard({ space }: { space: OperatedSpace }) {
  const memberLabel =
    space.memberCount != null
      ? `${space.memberCount} ${space.memberCount === 1 ? 'member' : 'members'}`
      : null
  return (
    <EntityCard
      href={space.manageHref}
      anchor={<SpaceAnchor logoUrl={space.logoUrl} />}
      title={space.name}
      badge={
        <span className="shrink-0 rounded-full bg-surface-elevated px-2 py-0.5 text-2xs font-semibold text-muted">
          {spaceTypeLabel(space.type)}
        </span>
      }
      context={space.via === 'owner' ? 'You own this space' : 'You help run this space'}
      meta={
        <>
          <span className="flex items-center gap-1">
            {space.via === 'owner' ? (
              <Crown className="h-3 w-3" aria-hidden />
            ) : (
              <Settings2 className="h-3 w-3" aria-hidden />
            )}
            {space.via === 'owner' ? 'Owner' : 'Admin'}
          </span>
          {memberLabel && (
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" aria-hidden />
              {memberLabel}
            </span>
          )}
        </>
      }
    />
  )
}

async function OperatedGrid({ profileId }: { profileId: string | null }) {
  const spaces = await listOperatedSpaces(profileId)

  if (spaces.length === 0) {
    return (
      <EmptyState
        icon={Building2}
        variant="first-use"
        title="You don't run any spaces yet."
        description="When you create a Space or are added as an admin of one, it shows up here, ready to manage."
      />
    )
  }

  // The container-query grid (each card sizes to the grid, not the viewport) stays portable across
  // rail/no-rail widths (PAGE-FRAMEWORK ADR-295).
  return (
    <div className="@container">
      <div className="grid grid-cols-1 gap-6 @lg:grid-cols-2 @2xl:grid-cols-3">
        {spaces.map((space) => (
          <OperatedSpaceCard key={space.id} space={space} />
        ))}
      </div>
    </div>
  )
}

export default async function SpacesOperatingPage() {
  // Gate: signed in. The list is naturally scoped to the Spaces the caller operates.
  const profileId = await getMyProfileId()

  return (
    <IndexTemplate
      title="Spaces you run"
      description="Open the management console for any Space you own or help run. This is your front door to the spaces you operate, separate from the directory you browse."
      action={
        <Link href="/spaces/new" className={buttonClasses('primary', 'md')}>
          <Building2 className="h-4 w-4" aria-hidden />
          Create a space
        </Link>
      }
    >
      <Suspense fallback={<GridSkeleton />}>
        <OperatedGrid profileId={profileId} />
      </Suspense>
    </IndexTemplate>
  )
}
