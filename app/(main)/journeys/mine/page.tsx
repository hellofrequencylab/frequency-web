import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Map, FileText, Globe, Users } from 'lucide-react'
import { getMyProfileId, getCallerProfile } from '@/lib/auth'
import { canCreate } from '@/lib/core/load-capabilities'
import { isPaid } from '@/lib/core/access-matrix'
import { getMyPlanSummaries, type MyPlanSummary } from '@/lib/journey-plans'
import { IndexTemplate } from '@/components/templates/index-template'
import { StatCard } from '@/components/ui/stat-card'
import { EmptyState } from '@/components/ui/empty-state'
import { NewJourneyButton } from '@/components/studio/journey/new-journey-button'
import { JourneyManageCard, type ManagePlan } from '@/components/journeys/journey-manage-card'
import { AuthoringAccessNote } from '@/components/pricing/authoring-access-note'

export const metadata: Metadata = { title: 'Your Journeys' }
export const dynamic = 'force-dynamic'

// The "Your Journeys" management space (the admin space for a member's own Journeys): store,
// edit, publish, duplicate, and delete everything you've built, drafts and live. Distinct from
// /journeys (the public library browse). Composes the IndexTemplate + a stat band + filter tabs.

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'draft', label: 'Drafts' },
  { key: 'live', label: 'Published' },
] as const

type FilterKey = (typeof FILTERS)[number]['key']

function toManage(p: MyPlanSummary): ManagePlan {
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
    phaseCount: p.phaseCount,
    stepCount: p.stepCount,
  }
}

export default async function MyJourneysPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const profileId = await getMyProfileId()
  if (!profileId) redirect('/sign-in?next=/journeys/mine')

  const { filter: raw } = await searchParams
  const filter: FilterKey = raw === 'draft' || raw === 'live' ? raw : 'all'

  const all = await getMyPlanSummaries(profileId)
  const isLive = (p: MyPlanSummary) => p.visibility === 'public'
  const published = all.filter(isLive)
  const drafts = all.filter((p) => !isLive(p))
  const shown = filter === 'live' ? published : filter === 'draft' ? drafts : all
  const totalAdopters = published.reduce((n, p) => n + (p.adopt_count ?? 0), 0)
  const countFor = (k: FilterKey) => (k === 'live' ? published.length : k === 'draft' ? drafts.length : all.length)
  // Real Crew (or steward/staff) may build a journey; others get the free-beta popup.
  const canBuildJourney = await canCreate('journey.create')
  // The permission note reads the REAL (post-beta) tier so it states what changes at launch, not the
  // beta-granted tier. Personal journeys are owned by the member, so paid = the member's real tier.
  const caller = await getCallerProfile()
  const paidOwner = isPaid(caller?.realMembershipTier)

  return (
    <IndexTemplate
      heroOverlay
      back={{ href: '/journeys', label: 'Back to the library' }}
      title="Your Journeys"
      description="Your space to store, edit, and publish everything you build. Drafts stay private until you publish them to the community library."
      action={<NewJourneyButton canCreate={canBuildJourney} />}
    >
      <div className="max-w-4xl space-y-6">
        <AuthoringAccessNote kind="journey" paidOwner={paidOwner} />

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard bordered size="sm" icon={Map} label="Journeys" value={all.length} />
          <StatCard bordered size="sm" icon={FileText} label="Drafts" value={drafts.length} />
          <StatCard bordered size="sm" icon={Globe} label="Published" value={published.length} />
          <StatCard bordered size="sm" icon={Users} label="Adopters" value={totalAdopters.toLocaleString()} />
        </div>

        {all.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map((f) => {
              const active = filter === f.key
              return (
                <Link
                  key={f.key}
                  href={f.key === 'all' ? '/journeys/mine' : `/journeys/mine?filter=${f.key}`}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                    active ? 'border-primary/50 bg-primary-bg text-primary-strong' : 'border-border bg-surface text-muted hover:text-text'
                  }`}
                >
                  {f.label} <span className="tabular-nums text-xs text-subtle">{countFor(f.key)}</span>
                </Link>
              )
            })}
          </div>
        )}

        {shown.length === 0 ? (
          <EmptyState
            icon={Map}
            title={all.length === 0 ? 'No journeys yet' : 'Nothing in this filter'}
            description={
              all.length === 0
                ? 'Build your first Journey with Vera, or lay one out by hand. It starts here as a private draft.'
                : 'Switch the filter above to see your other Journeys.'
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {shown.map((p) => (
              <JourneyManageCard key={p.id} plan={toManage(p)} />
            ))}
          </div>
        )}
      </div>
    </IndexTemplate>
  )
}
