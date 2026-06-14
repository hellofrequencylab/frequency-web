import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Flame } from 'lucide-react'
import { getPublicJourney } from '@/lib/journey-plans'
import { getPillars, pillarsById } from '@/lib/pillars'
import {
  StoryBlock,
  OutcomesBlock,
  PathBlock,
  PillarBalanceBlock,
  InstructorBlock,
  JourneyFaq,
  JourneyStatChips,
  AtAGlanceCard,
  journeyFacts,
  primaryPillar,
} from '@/components/journey/discovery-widgets'
import { getPlanAuthor } from '@/lib/journey-plans'
import { DetailTemplate } from '@/components/templates'
import { buttonClasses } from '@/components/ui/button'
import { accentColor, accentTint } from '@/lib/studio/accents'
import { JOURNEY_ICON_MAP, DefaultJourneyIcon } from '@/lib/studio/journey-icons'
import { SITE_NAME } from '@/lib/site'
import { JsonLd } from '@/components/json-ld'
import { journeySchema, breadcrumbSchema } from '@/lib/jsonld'

// Public, indexable detail page for one library Journey. Mirrors the in-app Journey
// page's header (badge + Pillar + stat chips) + two-column body + sticky "At a glance"
// card, but in the MARKETING register: anonymous visitors get a "Create a free account"
// CTA in place of the enroll actions. Revalidated hourly, canonical + OG/Twitter
// metadata, and JSON-LD (HowTo). Reuses the same discovery widgets so the public face
// and the member face stay in lockstep. Voice is v2; no em dashes.
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

  const [pillars, author] = await Promise.all([getPillars(), getPlanAuthor(plan.author_id)])
  const byId = pillarsById(pillars)
  const accent = plan.accent
  const PlanIcon = JOURNEY_ICON_MAP[plan.emoji ?? ''] ?? DefaultJourneyIcon

  const facts = journeyFacts(items)
  const topPillar = primaryPillar(items, byId)

  // The marketing-register CTA: sign up free, then start it.
  const signUpCta = (
    <div className="space-y-2">
      <Link href="/sign-in" className={buttonClasses('primary', 'md', 'w-full')}>
        Create a free account
      </Link>
      <p className="text-2xs leading-relaxed text-subtle">
        Free to start. Run it with your Circle or solo.
      </p>
    </div>
  )

  return (
    <div className="mx-auto max-w-5xl px-6 py-12 sm:py-16">
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

      <DetailTemplate
        back={{ href: '/discover/journeys', label: 'Journeys' }}
        title={
          <span className="inline-flex items-center gap-3 align-middle">
            <span
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl"
              style={{ backgroundColor: accentTint(accent, 16), color: accentColor(accent) }}
            >
              <PlanIcon className="h-6 w-6" />
            </span>
            <span className="min-w-0 break-words">{plan.title}</span>
          </span>
        }
        subtitle={
          <span className="block space-y-2">
            {plan.summary && <span className="block leading-relaxed text-text">{plan.summary}</span>}
            {author && (
              <Link
                href={`/people/${author.handle}`}
                className="inline-flex items-center gap-1 text-xs text-muted hover:text-text"
              >
                By <span className="font-semibold text-text">{author.displayName}</span>
              </Link>
            )}
            <span className="block pt-0.5">
              <JourneyStatChips facts={facts} plan={plan} enrolledCount={plan.adopt_count} />
            </span>
          </span>
        }
        badges={
          <span className="inline-flex flex-wrap items-center gap-1.5">
            {plan.official && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary-bg px-2 py-0.5 text-xs font-semibold text-primary-strong">
                <Flame className="h-3 w-3" /> Official
              </span>
            )}
            {topPillar && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary-bg px-2 py-0.5 text-xs font-medium text-primary-strong">
                {topPillar.name}
              </span>
            )}
          </span>
        }
        actions={
          <Link href="/sign-in" className={buttonClasses('primary', 'md')}>
            Create a free account
          </Link>
        }
      >
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-8">
          <aside className="mb-6 lg:order-2 lg:mb-0 lg:sticky lg:top-6 lg:self-start">
            <AtAGlanceCard
              plan={plan}
              slug={plan.slug}
              facts={facts}
              enrolled={false}
              canStart={facts.lessonCount > 0}
              isAuthor={false}
              progress={null}
              cta={signUpCta}
            />
          </aside>

          <div className="min-w-0 max-w-2xl space-y-8 lg:order-1">
            <StoryBlock intro={plan.intro} />
            <OutcomesBlock summary={plan.summary} />
            <div id="the-path" className="scroll-mt-6">
              <PathBlock items={items} pillarsById={byId} accent={accent} facts={facts} />
            </div>
            <PillarBalanceBlock items={items} pillars={pillars} />
            <InstructorBlock author={author} />
            <JourneyFaq plan={plan} />

            <div className="rounded-2xl border border-border bg-surface p-5 text-center shadow-sm">
              <p className="mb-1 text-lg font-bold text-text">Start this Journey</p>
              <p className="mx-auto mb-4 max-w-sm text-sm leading-relaxed text-muted">
                Sign up free to start it. Its phases drip one per week, your Circle can run it
                with you, and finishing earns the completion gems.
              </p>
              <Link href="/sign-in" className={buttonClasses('primary', 'md')}>
                Create a free account
              </Link>
            </div>
          </div>
        </div>
      </DetailTemplate>
    </div>
  )
}
