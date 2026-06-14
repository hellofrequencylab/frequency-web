import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { Globe, Lock, Link2, Pencil, Sparkles, Flame, Layers } from 'lucide-react'
import { DetailTemplate } from '@/components/templates'
import { getCallerProfile } from '@/lib/auth'
import { getJourneyView, getPlan, getPlanAuthor } from '@/lib/journey-plans'
import { getPillars, pillarsById as indexPillars } from '@/lib/pillars'
import { accentColor, accentTint } from '@/lib/studio/accents'
import { JOURNEY_ICON_MAP, DefaultJourneyIcon } from '@/lib/studio/journey-icons'
import { adoptPlanAction, forkPlanAction } from '../actions'
import { enabledWidgets } from '@/lib/journey-page-config'
import {
  StoryBlock,
  OutcomesBlock,
  PathBlock,
  PillarBalanceBlock,
  InstructorBlock,
  JourneyFaq,
  JourneyStatChips,
  AtAGlanceCard,
  EnrollCta,
  journeyFacts,
  primaryPillar,
} from '@/components/journey/discovery-widgets'

export const dynamic = 'force-dynamic'

// The one Journey page (docs/JOURNEYS.md §10). It flips between three faces:
//   • AUTHOR    → redirects to the v2 editor at /journeys/[slug]/edit (identity + delivery +
//                 publish settings and the Phase → Module → Lesson structure tree, ADR-252 J5).
//   • DISCOVERY → not enrolled / visitor: an info-rich header (badge + Pillar + stat chips +
//                 a persistent CTA), a two-column body (story · outcomes · the path accordion ·
//                 pillar balance · instructor · FAQ) and an interior sticky "At a glance" rail.
//   • ACTIVE    → enrolled: redirects to the v2 lesson player at /journeys/[slug]/learn.
// The retired season engine + the bottom CTA/reward dump are gone; the facts ride the header
// and the rail (no bottom dump). Voice is v2 (Run / Phase / enroll), no em dashes.

const VISIBILITY = {
  public: { Icon: Globe, label: 'Public' },
  unlisted: { Icon: Link2, label: 'Unlisted' },
  private: { Icon: Lock, label: 'Private' },
} as const

// Per-Journey metadata — a real title, summary, and share card for the tab, history, and any
// shared link (and ready for a public Journey route). Private plans stay generic.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const loaded = await getPlan(slug)
  if (!loaded || loaded.plan.visibility === 'private') return { title: 'Journey · Frequency' }
  const { plan } = loaded
  const title = plan.title
  const description =
    plan.summary ?? 'A guided set of phases to move through, on your own or with your Circle.'
  return {
    title,
    description,
    openGraph: {
      title: plan.title,
      description,
      type: 'article',
      ...(plan.cover_image ? { images: [{ url: plan.cover_image }] } : {}),
    },
    twitter: {
      card: plan.cover_image ? 'summary_large_image' : 'summary',
      title: plan.title,
      description,
    },
  }
}

export default async function JourneyPlanPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ preview?: string }>
}) {
  const { slug } = await params
  const { preview } = await searchParams
  const caller = await getCallerProfile()
  const profileId = caller?.id ?? null

  // Single data load for the read-only page (the contract).
  const view = await getJourneyView(profileId, slug)
  if (!view) notFound()
  const { plan, items, adopted } = view

  const isAuthor = !!profileId && plan.author_id === profileId
  if (!isAuthor && plan.visibility === 'private') notFound()

  // ── AUTHOR → the v2 editor (ADR-252, J5): identity + delivery + publish settings
  //    and the Phase → Module → Lesson structure tree, at /journeys/[slug]/edit. ──
  if (isAuthor && !preview) redirect(`/journeys/${plan.slug}/edit`)

  const [pillars, author] = await Promise.all([getPillars(), getPlanAuthor(plan.author_id)])
  const byId = indexPillars(pillars)
  const vis = VISIBILITY[plan.visibility]
  const accent = plan.accent
  const PlanIcon = JOURNEY_ICON_MAP[plan.emoji ?? ''] ?? DefaultJourneyIcon

  // ACTIVE → the v2 lesson player (ADR-252, J5). An enrolled learner goes straight to the
  // player; a previewing author stays on the discovery view.
  if (adopted && !preview) redirect(`/journeys/${plan.slug}/learn`)

  // Derive the at-a-glance facts ONCE; the header chips, the path accordion, and the rail
  // "what's included" list all read from this (so the numbers can never drift).
  const facts = journeyFacts(items)
  const topPillar = primaryPillar(items, byId)
  const canStart = facts.lessonCount > 0

  // Which discovery widgets the author enabled (still honours page_config order/toggles for
  // the optional blocks: story, pillar balance, social proof are opt-out-able).
  const enabled = new Set(enabledWidgets(plan.page_config, 'discovery').map((w) => w.id))

  const enrollProps = {
    planId: plan.id,
    slug: plan.slug,
    enrolled: adopted,
    canStart,
    isAuthor,
    enrollAction: adoptPlanAction,
    forkAction: forkPlanAction,
  }

  const page = (
    <DetailTemplate
      hero={
        plan.cover_image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={plan.cover_image} alt="" className="h-44 w-full rounded-2xl border border-border object-cover sm:h-56" />
        ) : undefined
      }
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
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            {author && (
              <Link
                href={`/people/${author.handle}`}
                className="inline-flex items-center gap-1 text-muted hover:text-text"
              >
                By <span className="font-semibold text-text">{author.displayName}</span>
              </Link>
            )}
            <Link
              href="/crew"
              className="inline-flex items-center gap-1 text-primary-strong hover:underline"
            >
              <Flame className="h-3 w-3 shrink-0" aria-hidden />
              Keep your streak in the Quest
            </Link>
            <a
              href="#the-path"
              className="inline-flex items-center gap-1 text-primary-strong hover:underline"
            >
              <Layers className="h-3 w-3 shrink-0" aria-hidden />
              The path
            </a>
          </span>
          {/* Stat-chip row — quiet, tokenized facts (gamified-stat law: only gems reads
              as a reward; the rest is calm context). */}
          <span className="block pt-0.5">
            <JourneyStatChips facts={facts} plan={plan} enrolledCount={plan.adopt_count} />
          </span>
        </span>
      }
      badges={
        <span className="inline-flex flex-wrap items-center gap-1.5">
          {plan.official && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary-bg px-2 py-0.5 text-xs font-semibold text-primary-strong">
              <Sparkles className="h-3 w-3" /> Official
            </span>
          )}
          <span className="inline-flex items-center gap-1 rounded-full bg-surface-elevated px-2 py-0.5 text-xs font-medium text-muted">
            <vis.Icon className="h-3 w-3" /> {vis.label}
          </span>
          {topPillar && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary-bg px-2 py-0.5 text-xs font-medium text-primary-strong">
              {topPillar.name}
            </span>
          )}
        </span>
      }
      actions={
        <EnrollCta {...enrollProps} layout="inline" />
      }
    >
      {/* Two-column body: a readable main column + an interior STICKY rail (distinct from
          the global app rail). Below lg the rail stacks RIGHT AFTER the header so the
          at-a-glance/CTA stays above the long curriculum on mobile. */}
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-8">
        {/* Interior rail — first in source order so it leads on mobile; pinned right on lg+. */}
        <aside className="mb-6 lg:order-2 lg:mb-0 lg:sticky lg:top-6 lg:self-start">
          <AtAGlanceCard
            plan={plan}
            slug={plan.slug}
            facts={facts}
            enrolled={adopted}
            canStart={canStart}
            isAuthor={isAuthor}
            progress={null}
            enrollAction={adoptPlanAction}
            forkAction={forkPlanAction}
          />
        </aside>

        {/* Main column — capped to a comfortable reading measure. */}
        <div className="min-w-0 max-w-2xl space-y-8 lg:order-1">
          {enabled.has('story') && <StoryBlock intro={plan.intro} />}
          <OutcomesBlock summary={plan.summary} />
          <div id="the-path" className="scroll-mt-6">
            <PathBlock items={items} pillarsById={byId} accent={accent} facts={facts} />
          </div>
          {enabled.has('pillar-balance') && <PillarBalanceBlock items={items} pillars={pillars} />}
          <InstructorBlock author={author} />
          <JourneyFaq plan={plan} />

          {/* The repeat CTA closes the page (no bottom dump of rewards/rules). */}
          {!isAuthor && (
            <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
              <p className="mb-3 text-sm font-semibold text-text">
                Start it solo, or run it with your Circle.
              </p>
              <EnrollCta {...enrollProps} layout="inline" />
            </div>
          )}
        </div>
      </div>
    </DetailTemplate>
  )

  return (
    <>
      {isAuthor && preview && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface px-4 py-2.5">
          <span className="text-sm text-muted">Preview. How others see your Journey.</span>
          <Link
            href={`/journeys/${plan.slug}`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
          >
            <Pencil className="h-3.5 w-3.5" /> Back to editing
          </Link>
        </div>
      )}

      {page}
    </>
  )
}
