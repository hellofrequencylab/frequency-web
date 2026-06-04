import type { Metadata } from 'next'
import Link from 'next/link'
import { Map, Plus, ArrowRight, Users, Lock, Globe } from 'lucide-react'
import { getMyProfileId } from '@/lib/auth'
import { getMyPlans, listPublicPlans, type JourneyPlan } from '@/lib/journey-plans'
import { IndexTemplate } from '@/components/templates/index-template'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'
import { createPlanAction } from './actions'

export const metadata: Metadata = {
  title: 'Journeys',
  description: 'Build a journey from the practices you love and share it with the community.',
}

function PlanRow({ plan, mine }: { plan: JourneyPlan; mine: boolean }) {
  return (
    <li>
      <Link
        href={`/journeys/${plan.slug}`}
        className="group flex items-center justify-between gap-4 rounded-2xl border border-border bg-surface px-5 py-4 shadow-sm transition-colors hover:border-primary-bg hover:shadow-md"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-base font-bold text-text">{plan.title}</p>
            {mine && (
              <span className="inline-flex items-center gap-1 rounded-full bg-surface-elevated px-2 py-0.5 text-[11px] font-medium text-muted">
                {plan.visibility === 'public' ? <Globe className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
                {plan.visibility === 'public' ? 'Public' : plan.visibility === 'unlisted' ? 'Unlisted' : 'Private'}
              </span>
            )}
          </div>
          {plan.summary && <p className="mt-0.5 line-clamp-1 text-sm text-muted">{plan.summary}</p>}
          {!mine && plan.adopt_count > 0 && (
            <p className="mt-0.5 flex items-center gap-1 text-xs text-subtle">
              <Users className="h-3 w-3" /> {plan.adopt_count} {plan.adopt_count === 1 ? 'person' : 'people'}
            </p>
          )}
        </div>
        <ArrowRight className="h-4 w-4 shrink-0 text-subtle transition-colors group-hover:text-primary-strong" />
      </Link>
    </li>
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
            <ul className="space-y-3">
              {mine.map((p) => (
                <PlanRow key={p.id} plan={p} mine />
              ))}
            </ul>
          )}
        </section>

        <section>
          <SectionHeader title="Community library" count={community.length} />
          {community.length === 0 ? (
            <EmptyState icon={Users} title="The library is just getting started" description="Build a journey and publish it to be the first to share one." />
          ) : (
            <ul className="space-y-3">
              {community.map((p) => (
                <PlanRow key={p.id} plan={p} mine={false} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </IndexTemplate>
  )
}
