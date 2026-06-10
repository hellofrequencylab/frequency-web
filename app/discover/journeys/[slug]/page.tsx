import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { getPublicJourney } from '@/lib/journey-plans'
import { getPillars, pillarsById } from '@/lib/pillars'
import {
  StoryBlock,
  PathBlock,
  PillarBalanceBlock,
  CompletionRuleBlock,
  RewardPreviewBlock,
} from '@/components/journey/discovery-widgets'
import { SignInCta } from '@/components/discover/cards'
import { FrequencyArcs } from '@/components/marketing/vector-art'
import { DetailTemplate } from '@/components/templates'
import { SITE_NAME } from '@/lib/site'
import { JsonLd } from '@/components/json-ld'
import { journeySchema, breadcrumbSchema } from '@/lib/jsonld'

// Public, indexable detail page for one library Journey. Mirrors the discover
// events detail page: revalidated hourly, canonical + OG/Twitter metadata, and
// JSON-LD (HowTo — the AEO lever for guides, CONTENT-VOICE §8b). Reuses the same
// discovery widgets the in-app Journey page composes, so the public face and the
// member face stay in lockstep. Anonymous visitors get a sign-in CTA in place of
// the adopt/remix actions.
export const revalidate = 3600

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const found = await getPublicJourney(slug)
  if (!found) return { title: 'Journey not found' }
  const { plan } = found

  const full =
    plan.summary ?? `${plan.title}: a guided practice Journey on ${SITE_NAME}. Sign in to start it.`
  // Search snippets truncate around 155 chars — keep the meta description tight.
  const description = full.length > 155 ? `${full.slice(0, 152).trimEnd()}…` : full
  const ogTitle = `${plan.title} · ${SITE_NAME}`
  return {
    title: plan.title,
    description,
    alternates: { canonical: `/discover/journeys/${plan.slug}` },
    openGraph: {
      title: ogTitle,
      description,
      url: `/discover/journeys/${plan.slug}`,
      type: 'article',
    },
    twitter: { card: 'summary_large_image', title: ogTitle, description },
  }
}

export default async function DiscoverJourneyPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const found = await getPublicJourney(slug)
  if (!found) notFound()
  const { plan, items } = found

  const pillars = await getPillars()
  const byId = pillarsById(pillars)

  return (
    <div className="relative overflow-hidden max-w-3xl mx-auto px-6 py-20 sm:py-24">
      {/* Frequency arcs radiating up under the Journey, tying practice to place. */}
      <FrequencyArcs
        aria-hidden
        className="pointer-events-none absolute -top-10 right-0 w-[28rem] max-w-none text-primary opacity-[0.05]"
      />
      <JsonLd
        data={[
          journeySchema(plan, items),
          breadcrumbSchema([
            { name: 'Discover', path: '/discover' },
            { name: 'Journeys', path: '/discover/journeys' },
            { name: plan.title, path: `/discover/journeys/${plan.slug}` },
          ]),
        ]}
      />

      <Link
        href="/discover/journeys"
        className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-muted transition-colors hover:text-text"
      >
        <ChevronLeft className="h-4 w-4" />
        Journeys
      </Link>

      <DetailTemplate
        title={
          <span>
            {plan.emoji ? `${plan.emoji} ` : ''}
            {plan.title}
          </span>
        }
        subtitle={
          <div className="space-y-2">
            {plan.summary && (
              <p className="text-base text-muted leading-relaxed">{plan.summary}</p>
            )}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-subtle">
              <span>
                {items.length} {items.length === 1 ? 'practice' : 'practices'}
              </span>
              {plan.adopt_count > 0 && <span>{plan.adopt_count} on this Journey</span>}
            </div>
          </div>
        }
        badges={
          plan.official ? (
            <span className="inline-block text-xs px-2 py-1 rounded-md font-medium bg-primary-bg text-primary-strong">
              Official Journey
            </span>
          ) : undefined
        }
      >
        <div className="space-y-8">
          {plan.intro && <StoryBlock intro={plan.intro} />}

          <PathBlock items={items} pillarsById={byId} accent={plan.accent} />

          <PillarBalanceBlock items={items} pillars={pillars} />

          <div className="grid gap-3 sm:grid-cols-2">
            <CompletionRuleBlock targetWeeks={plan.target_weeks} />
            <RewardPreviewBlock gems={plan.completion_gems} />
          </div>

          <SignInCta
            title="Start this Journey"
            body="Sign up free to adopt this Journey: its practices flow into your daily loop, your circle can run it with you, and finishing the season earns the completion badge. Two words to belong."
            action="Sign up free"
          />
        </div>
      </DetailTemplate>
    </div>
  )
}
