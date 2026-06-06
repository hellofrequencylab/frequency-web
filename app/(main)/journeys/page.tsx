import type { Metadata } from 'next'
import Image from 'next/image'
import { Map, Users, Lock, Globe, Link2, Sparkles } from 'lucide-react'
import { getMyProfileId } from '@/lib/auth'
import { getMyPlans, listPublicPlans, type JourneyPlan } from '@/lib/journey-plans'
import { EntityCard } from '@/components/cards/entity-card'
import { IndexTemplate } from '@/components/templates/index-template'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'
import { accentColor, accentTint } from '@/lib/studio/accents'
import { NewJourneyButton } from '@/components/studio/journey/new-journey-button'

export const metadata: Metadata = {
  title: 'Journeys',
  description: 'Build a journey from the practices you love and share it with the community.',
}

function PlanCard({ plan, mine }: { plan: JourneyPlan; mine: boolean }) {
  return (
    <EntityCard
      href={`/journeys/${plan.slug}`}
      anchor={
        plan.emoji ? (
          <div
            className="flex h-11 w-11 items-center justify-center rounded-2xl text-xl"
            style={{ backgroundColor: accentTint(plan.accent, 16), color: accentColor(plan.accent) }}
          >
            {plan.emoji}
          </div>
        ) : plan.cover_image ? (
          <Image src={plan.cover_image} alt={plan.title} width={44} height={44} className="h-11 w-11 rounded-2xl object-cover" />
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
            {plan.visibility === 'public' ? <Globe className="h-3 w-3" /> : plan.visibility === 'unlisted' ? <Link2 className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
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
      description="Build a journey from the practices you love — a life-development track across Mind, Body, Spirit, and Expression. Keep it for yourself, or share it to the open library for anyone to adopt."
      action={<NewJourneyButton />}
    >
      <div className="max-w-2xl space-y-8">
        {/* Launch CTA — opens the Studio window in place. */}
        <section>
          <div className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-gradient-to-br from-primary-bg/50 to-signal-bg/40 p-5 shadow-sm">
            <div className="min-w-0">
              <h2 className="flex items-center gap-1.5 text-base font-bold text-text">
                <Sparkles className="h-4 w-4 text-primary-strong" /> Start a journey
              </h2>
              <p className="mt-0.5 text-sm text-muted">
                From a single daily practice to a full course — give it a face, add your practices, and share how you show up.
              </p>
            </div>
            <div className="shrink-0">
              <NewJourneyButton />
            </div>
          </div>
        </section>

        <section>
          <SectionHeader title="Your journeys" count={mine.length} />
          {mine.length === 0 ? (
            <EmptyState icon={Map} title="No journeys yet" description="Hit “New journey” to open the builder and lay out your path." />
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
            <EmptyState icon={Users} title="The library is just getting started" description="Build a journey and share it to be the first in the library." />
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
