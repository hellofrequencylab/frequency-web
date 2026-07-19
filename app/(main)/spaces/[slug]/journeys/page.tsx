import { notFound } from 'next/navigation'
import { Map, FileText, Globe, Library } from 'lucide-react'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { spaceManageHref } from '@/lib/spaces/types'
import { listJourneyPlansForSpace, type JourneyPlan } from '@/lib/journey-plans'
import { IndexTemplate } from '@/components/templates'
import { StatCard } from '@/components/ui/stat-card'
import { EmptyState } from '@/components/ui/empty-state'
import { JourneyManageCard, type ManagePlan } from '@/components/journeys/journey-manage-card'
import { NewSpaceJourneyButton } from '@/components/spaces/new-space-journey-button'
import { AuthoringAccessNote } from '@/components/pricing/authoring-access-note'
import { asSpacePlan } from '@/lib/pricing/plans'

// SPACE-SCOPED Journeys manager (the practitioner's programs): store, edit, publish, and delete every
// Journey this Space owns, drafts and live. Owner-gated (canEditProfile = owner / admin / editor) and
// scoped to this space_id, so it lists ALL of a Space's Journeys (private drafts included), unlike the
// public profile block (which reads publishedOnly). Distinct from /journeys/mine (a member's personal
// Journeys). Composes the IndexTemplate + a stat band + the shared JourneyManageCard grid.
//
// GATE: we notFound() a missing / not-visible space AND a viewer who cannot edit it (no existence leak,
// the same owner-only pattern the Space consoles use). No em or en dashes; voice per CONTENT-VOICE §10.

export const metadata = { title: 'Journeys' }
export const dynamic = 'force-dynamic'

// listJourneyPlansForSpace returns plain JourneyPlan rows, which carry no phase/step counts (those come
// only from getMyPlanSummaries). The manage card shows them, so we pass 0/0 here rather than run the
// extra grouped read; the counts fill in inside the editor.
function toManage(p: JourneyPlan): ManagePlan {
  return {
    id: p.id,
    slug: p.slug,
    title: p.title,
    summary: p.summary,
    emoji: p.emoji,
    accent: p.accent,
    coverImage: p.cover_image,
    visibility: p.visibility,
    status: p.status,
    adoptCount: p.adopt_count,
    updatedAt: p.updated_at,
    phaseCount: 0,
    stepCount: 0,
  }
}

export default async function SpaceJourneysManagerPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  const caller = await getCallerProfile()
  const viewerProfileId = caller?.id ?? null

  // Resolve the space, failing closed on a missing / not-visible space (no existence leak).
  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) notFound()

  // Owner-only surface: a viewer who cannot edit the Space gets a 404 (never a "you can't", which would
  // leak that the manager exists). canEditProfile = owner / admin / editor.
  const caps = await getSpaceCapabilities(space, viewerProfileId)
  if (!caps.canEditProfile) notFound()

  const plans = await listJourneyPlansForSpace(space.id, 50)
  const drafts = plans.filter((p) => p.visibility === 'private')
  const published = plans.filter((p) => p.visibility !== 'private')
  const inLibrary = plans.filter((p) => p.visibility === 'public')

  return (
    <IndexTemplate
      back={{ href: spaceManageHref(space.type, space.slug), label: 'Back to manage' }}
      eyebrow={space.brandName ?? space.name}
      title="Journeys"
      description="Build multi week programs for your members. Drafts stay private until you publish them."
      action={<NewSpaceJourneyButton slug={space.slug} />}
    >
      <div className="max-w-4xl space-y-6">
        <AuthoringAccessNote kind="journey" paidOwner={asSpacePlan(space.plan) !== 'free'} />

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard bordered size="sm" icon={Map} label="Journeys" value={plans.length} />
          <StatCard bordered size="sm" icon={FileText} label="Drafts" value={drafts.length} />
          <StatCard bordered size="sm" icon={Globe} label="Published" value={published.length} />
          <StatCard bordered size="sm" icon={Library} label="In library" value={inLibrary.length} />
        </div>

        {plans.length === 0 ? (
          <EmptyState
            icon={Map}
            title="No journeys yet"
            description="Build your first program for this space. It starts here as a private draft you can shape and publish when it is ready."
          />
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {plans.map((p) => (
              <JourneyManageCard key={p.id} plan={toManage(p)} />
            ))}
          </div>
        )}
      </div>
    </IndexTemplate>
  )
}
