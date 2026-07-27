import { notFound } from 'next/navigation'
import Link from 'next/link'
import { UsersRound, Users, Route, PlayCircle } from 'lucide-react'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { spaceManageHref } from '@/lib/spaces/types'
import { listSpaceCirclesWithRuns } from '@/lib/circles/store'
import { journeysOfferedBySpace } from '@/lib/journeys/run-gate'
import { IndexTemplate } from '@/components/templates'
import { StatCard } from '@/components/ui/stat-card'
import { EmptyState } from '@/components/ui/empty-state'
import { SpaceCirclesManager } from '@/components/spaces/space-circles-manager'

// SPACE-SCOPED Circles manager (ADR-842): the Circles this Space runs, and the Journey each one is
// moving through. A Space Circle is a Circle stamped with this space_id, so it belongs to the Space
// rather than to the member who made it. Starting a Run here enrolls that Circle's active members
// in one of the Space's own Journeys.
//
// GATE: notFound() on a missing / not-visible space AND on a viewer who cannot edit it (no
// existence leak, the same owner-only pattern the other Space consoles use). Voice per
// CONTENT-VOICE §10: member copy says "Run", never "cohort" (NAMING.md).

export const metadata = { title: 'Circles' }
export const dynamic = 'force-dynamic'

export default async function SpaceCirclesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  const caller = await getCallerProfile()
  const viewerProfileId = caller?.id ?? null

  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) notFound()
  const caps = await getSpaceCapabilities(space, viewerProfileId)
  if (!caps.canEditProfile) notFound()

  // The Circles this Space owns (with any active Run), and the Journeys it can start a Run of.
  const [circles, offered] = await Promise.all([
    listSpaceCirclesWithRuns(space.id, 50),
    journeysOfferedBySpace(space.id),
  ])

  const running = circles.filter((c) => c.run).length
  const members = circles.reduce((n, c) => n + (c.member_count ?? 0), 0)

  return (
    <IndexTemplate
      back={{ href: spaceManageHref(space.type, space.slug), label: 'Back to manage' }}
      eyebrow={space.brandName ?? space.name}
      title="Circles"
      description="The circles this space runs. Start a Run to move a circle through one of your Journeys together."
    >
      <div className="max-w-4xl space-y-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard bordered size="sm" icon={UsersRound} label="Circles" value={circles.length} />
          <StatCard bordered size="sm" icon={PlayCircle} label="Running" value={running} />
          <StatCard bordered size="sm" icon={Users} label="Members" value={members} />
          <StatCard bordered size="sm" icon={Route} label="Journeys offered" value={offered.length} />
        </div>

        <SpaceCirclesManager
          spaceSlug={space.slug}
          viewerProfileId={viewerProfileId ?? ''}
          circles={circles.map((c) => ({
            id: c.id,
            slug: c.slug,
            name: c.name,
            about: c.about,
            status: c.status,
            memberCount: c.member_count ?? 0,
            run: c.run,
          }))}
          journeys={offered}
        />

        {circles.length === 0 && offered.length === 0 && (
          <EmptyState
            icon={Route}
            title="No Journeys to run yet"
            description="Build a Journey for this space first, then make a circle and start a Run of it together."
            action={
              <Link
                href={`/spaces/${space.slug}/journeys`}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary transition-colors hover:bg-primary-hover"
              >
                Build a Journey
              </Link>
            }
          />
        )}
      </div>
    </IndexTemplate>
  )
}
