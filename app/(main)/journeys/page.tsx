import type { Metadata } from 'next'
import Image from 'next/image'
import { Map, Plus, Users, Lock, Globe } from 'lucide-react'
import { getMyProfileId } from '@/lib/auth'
import { getMyPlans, listPublicPlans, type JourneyPlan } from '@/lib/journey-plans'
import { EntityCard } from '@/components/cards/entity-card'
import { IndexTemplate } from '@/components/templates/index-template'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'
import { createPlanAction } from './actions'

export const metadata: Metadata = {
  title: 'Journeys',
  description: 'Build a journey from the practices you love and share it with the community.',
}

// A journey, in the shared card shell. The whole card links to the journey; the
// visibility pill (own plans) sits by the title, the adopt count (library plans)
// in the footer.
function PlanCard({ plan, mine }: { plan: JourneyPlan; mine: boolean }) {
  return (
    <EntityCard
      href={`/journeys/${plan.slug}`}
      anchor={
        plan.cover_image ? (
          <Image
            src={plan.cover_image}
            alt={plan.title}
            width={44}
            height={44}
            className="h-11 w-11 rounded-2xl object-cover"
          />
        ) : (
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary-bg text-primary-strong">
            <Map className="h-5 w-5" />
          </div>
        )
      }
      title={plan.title}
      badge={
        mine ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-surface-elevated px-2 py-0.5 text-xs font-medium text-muted">
            {plan.visibility === 'public' ? <Globe className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
            {plan.visibility === 'public' ? 'Public' : plan.visibility === 'unlisted' ? 'Unlisted' : 'Private'}
          </span>
        ) : undefined
      }
      description={plan.summary ?? undefined}
      meta={
        !mine && plan.adopt_count > 0 ? (
          <span className="flex items-center gap-1">
            <Users className="h-3 w-3" /> {plan.adopt_count} {plan.adopt_count === 1 ? 'person' : 'people'}
          </span>
        ) : undefined
      }
    />
  )
}

export default async function JourneysPage() {
  const profileId = await getMyProfileId()
  const [mine, library] = await Promise.all([
    profileId ? getMyPlans(profileId) : Promise.resolve([] as JourneyPlan[]),
    listPublicPlans(),
  ])
  const community = library.filter((p) => p.author_id !== profileId)

  return (
    <IndexTemplate
      title="Journeys"
      description="Build a journey from the practices you love — a personal path across Mind, Body, Spirit, and Expression. Keep it for yourself, or share it to the open library for anyone to adopt."
    >
      <div className="max-w-2xl space-y-8">
        <section>
          <SectionHeader title="Start a journey" />
          <form action={createPlanAction} className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
            <div className="flex items-center gap-2.5">
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-bg text-primary-strong">
                <Map className="h-5 w-5" />
              </span>
              <input
                name="title"
                required
                maxLength={80}
                placeholder="Name your journey — e.g. “Morning reset”"
                className="min-w-0 flex-1 bg-transparent text-base font-semibold text-text placeholder:text-subtle focus:outline-none"
              />
              <button
                type="submit"
                className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
              >
                <Plus className="h-4 w-4" /> Create
              </button>
            </div>
            <input
              name="summary"
              maxLength={160}
              placeholder="One line about it (optional)"
              className="mt-2 w-full bg-transparent text-sm text-muted placeholder:text-subtle focus:outline-none"
            />
          </form>
        </section>

        <section>
          <SectionHeader title="Your journeys" count={mine.length} />
          {mine.length === 0 ? (
            <EmptyState icon={Map} title="No journeys yet" description="Name one above, then add the practices that belong on the path." />
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {mine.map((p) => (
                <PlanCard key={p.id} plan={p} mine />
              ))}
            </div>
          )}
        </section>

        <section>
          <SectionHeader title="Community library" count={community.length} />
          {community.length === 0 ? (
            <EmptyState icon={Users} title="The library is just getting started" description="Build a journey and publish it to be the first to share one." />
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {community.map((p) => (
                <PlanCard key={p.id} plan={p} mine={false} />
              ))}
            </div>
          )}
        </section>
      </div>
    </IndexTemplate>
  )
}
