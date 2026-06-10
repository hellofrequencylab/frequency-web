import Image from 'next/image'
import Link from 'next/link'
import { Map, Users, Lock, Globe, Link2, Sparkles, Compass, ArrowRight } from 'lucide-react'
import { getMyProfileId } from '@/lib/auth'
import { getMyPlans, listPublicPlans, type JourneyPlan } from '@/lib/journey-plans'
import { EntityCard } from '@/components/cards/entity-card'
import { IndexTemplate } from '@/components/templates/index-template'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'
import { accentColor, accentTint } from '@/lib/studio/accents'
import { JOURNEY_ICON_MAP, DefaultJourneyIcon } from '@/lib/studio/journey-icons'
import { NewJourneyButton } from '@/components/studio/journey/new-journey-button'
import { resolvePageContent, pageContentMetadata } from '@/lib/page-content'

// Coded defaults for the operator-editable header content (ADR-180).
const CONTENT_FALLBACK = {
  title: 'Journeys',
  description: 'Build a journey from the practices you love: a life-development track across Mind, Body, Spirit, and Expression. Keep it for yourself, or share it to the open library for anyone to adopt.',
}

// Operator-set title/description also drive <title> + og/twitter cards (PX.2);
// the fallback strings are the page's previous static metadata, unchanged.
export function generateMetadata() {
  return pageContentMetadata('/journeys', {
    title: 'Journeys',
    description: 'Build a journey from the practices you love and share it with the community.',
  })
}

function PlanFace({ plan }: { plan: JourneyPlan }) {
  if (plan.cover_image) {
    return (
      <Image src={plan.cover_image} alt={plan.title} width={44} height={44} className="h-11 w-11 rounded-2xl object-cover" />
    )
  }
  const Icon = JOURNEY_ICON_MAP[plan.emoji ?? ''] ?? DefaultJourneyIcon
  return (
    <div
      className="flex h-11 w-11 items-center justify-center rounded-2xl"
      style={{ backgroundColor: accentTint(plan.accent, 16), color: accentColor(plan.accent) }}
    >
      <Icon className="h-5 w-5" />
    </div>
  )
}

function PlanCard({ plan, mine }: { plan: JourneyPlan; mine: boolean }) {
  return (
    <EntityCard
      href={`/journeys/${plan.slug}`}
      anchor={<PlanFace plan={plan} />}
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

  // Operator-editable page header (ADR-180) — falls back to the coded defaults.
  const { title, description, heroImage, ctaLabel, ctaHref } =
    await resolvePageContent('/journeys', CONTENT_FALLBACK)

  return (
    <IndexTemplate
      title={title}
      description={description}
      action={
        <div className="flex items-center gap-2">
          <NewJourneyButton />
          {/* Operator-set CTA (PX.1) — shows only when both label + link are set. */}
          {ctaLabel && ctaHref && (
            <a
              href={ctaHref}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary shadow-sm transition-colors hover:bg-primary-hover"
            >
              {ctaLabel}
            </a>
          )}
        </div>
      }
    >
      {/* Operator-set hero banner (PX.1) — renders only when set. */}
      {heroImage && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={heroImage}
          alt=""
          className="mb-6 h-44 w-full max-w-4xl rounded-2xl border border-border object-cover sm:h-56"
        />
      )}

      <div className="max-w-4xl space-y-10">
        {/* Two ways in: build your own, or follow the season's official Quests. */}
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Launch CTA — opens the Studio window in place. */}
          <div className="flex flex-col justify-between gap-4 rounded-2xl border border-border bg-gradient-to-br from-primary-bg/50 to-signal-bg/40 p-5 shadow-sm">
            <div className="min-w-0">
              <h2 className="flex items-center gap-1.5 text-base font-bold text-text">
                <Sparkles className="h-4 w-4 text-primary-strong" /> Start a journey
              </h2>
              <p className="mt-1 text-sm text-muted">
                From a single daily practice to a full course. Give it a face, add your practices, and share how you show up.
              </p>
            </div>
            <div>
              <NewJourneyButton />
            </div>
          </div>

          {/* Quests — the official containers that group Journeys for the season. */}
          <Link
            href="/crew/quests"
            className="group flex flex-col justify-between gap-4 rounded-2xl border border-border bg-surface p-5 shadow-sm transition-colors hover:border-primary"
          >
            <div className="min-w-0">
              <h2 className="flex items-center gap-1.5 text-base font-bold text-text">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary-bg text-primary-strong">
                  <Compass className="h-4 w-4" />
                </span>
                Explore Quests
              </h2>
              <p className="mt-1 text-sm text-muted">
                The season’s official Quests: guided tracks of practices, free to start, with rewards as you go.
              </p>
            </div>
            <span className="inline-flex items-center gap-1 text-sm font-semibold text-primary-strong">
              See this season’s Quests
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>
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
