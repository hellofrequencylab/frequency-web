import Link from 'next/link'
import { Suspense } from 'react'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Globe, Lock, Link2, Pencil, Sparkles } from 'lucide-react'
import { DetailTemplate } from '@/components/templates'
import { getCallerProfile } from '@/lib/auth'
import { getJourneyView, getPlan } from '@/lib/journey-plans'
import { listPublicPractices } from '@/lib/practices'
import { getPillars, pillarsById as indexPillars } from '@/lib/pillars'
import { accentColor, accentTint } from '@/lib/studio/accents'
import { JourneyBuilder, type BuilderItem } from '@/components/studio/journey/journey-builder'
import { adoptPlanAction, forkPlanAction } from '../actions'
import { enabledWidgets, type WidgetId } from '@/lib/journey-page-config'
import { NextStepCard } from '@/components/journey/next-step-card'
import { SeasonProgress } from '@/components/journey/season-progress'
import { StepChecklist, type ChecklistRow } from '@/components/journey/step-checklist'
import { CoopMeter } from '@/components/journey/coop-meter'
import { SeasonContext } from '@/components/journey/season-context'
import { TierControl } from '@/components/journey/tier-control'
import { GamificationPanel } from '@/components/journey/gamification-panel'
import { StreakStrip } from '@/components/journey/streak-strip'
import { JourneyCelebrationStage } from '@/components/journey/journey-celebration'
import {
  StoryBlock,
  PathBlock,
  PillarBalanceBlock,
  SocialProofBlock,
  RewardPreviewBlock,
  CompletionRuleBlock,
  PracticeGuideBlock,
  AdoptRemixBlock,
} from '@/components/journey/discovery-widgets'

export const dynamic = 'force-dynamic'

// The one Journey page (docs/JOURNEYS.md §10). It flips between three faces:
//   • AUTHOR    → the Studio <JourneyBuilder> (kept exactly as-is).
//   • DISCOVERY → not adopted / visitor: the story, the path, pillar balance, social proof,
//                 reward + completion rule, adopt/remix CTA.
//   • ACTIVE    → adopted: the Next-Step card, season progress, checklist, gamification +
//                 streak (behind Suspense — never blocks the shell), co-op, tier control.
// Both modes compose widgets in the order resolved by normalizePageConfig(page_config, mode).

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
  const title = `${plan.emoji ? `${plan.emoji} ` : ''}${plan.title}`
  const description =
    plan.summary ?? 'A seasonal set of practices to move through — on your own or with your circle.'
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

  // Single data load for the read-only page (the contract). The author branch needs the
  // practice library + pillars too, so it loads those alongside.
  const view = await getJourneyView(profileId, slug)
  if (!view) notFound()
  const { plan, items, adopted, progress } = view

  const isAuthor = !!profileId && plan.author_id === profileId
  if (!isAuthor && plan.visibility === 'private') notFound()

  // ── AUTHOR → the Studio builder (left exactly as it was). ─────────────────
  if (isAuthor && !preview) {
    const [library, pillars] = await Promise.all([listPublicPractices(), getPillars()])
    const builderItems: BuilderItem[] = items.map((it) => ({
      practiceId: it.practice_id,
      title: it.practice?.title ?? 'Practice',
      description: it.practice?.description ?? null,
      domainId: it.domain_id ?? it.practice?.domain_id ?? null,
      note: it.note,
      cadence: it.cadence,
      practiceCadence: it.practice?.cadence ?? null,
      defaultTier: it.default_tier,
    }))
    const available = library
      .filter((p) => p.is_public)
      .map((p) => ({ id: p.id, title: p.title, description: p.description, domainId: p.domain_id }))

    return (
      <JourneyBuilder
        planId={plan.id}
        slug={plan.slug}
        initialTitle={plan.title}
        initialSummary={plan.summary}
        initialIntro={plan.intro}
        initialEmoji={plan.emoji}
        initialAccent={plan.accent}
        initialVisibility={plan.visibility}
        initialItems={builderItems}
        available={available}
        pillars={pillars.map((p) => ({ id: p.id, slug: p.slug, name: p.name }))}
        initialStatus={plan.status}
        initialMinPracticesPerDay={plan.min_practices_per_day}
        initialTargetWeeks={plan.target_weeks}
        initialSeasonLocked={plan.season_locked}
        initialCompletionGems={plan.completion_gems}
        initialPageConfig={plan.page_config}
        initialOfficial={plan.official}
        initialQuestId={plan.quest_id}
      />
    )
  }

  const pillars = await getPillars()
  const byId = indexPillars(pillars)
  const vis = VISIBILITY[plan.visibility]
  const accent = plan.accent

  const isActive = adopted && !!progress

  // The widget order for the active mode comes from the plan's page_config (or the default).
  const activeWidgets = enabledWidgets(plan.page_config, 'active').map((w) => w.id)
  const discoveryWidgets = enabledWidgets(plan.page_config, 'discovery').map((w) => w.id)

  const header = (
    <DetailTemplate
      title={
        <span className="inline-flex items-center gap-3 align-middle">
          <span
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-2xl"
            style={{ backgroundColor: accentTint(accent, 16), color: accentColor(accent) }}
          >
            {plan.emoji || '🧭'}
          </span>
          <span className="min-w-0 break-words">{plan.title}</span>
        </span>
      }
      subtitle={plan.summary ? <span className="leading-relaxed">{plan.summary}</span> : undefined}
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
        </span>
      }
    >
      {isActive && progress ? (
        <ActiveMode
          widgets={activeWidgets}
          plan={plan}
          progress={progress}
          profileId={profileId as string}
          pillars={pillars}
        />
      ) : (
        <DiscoveryMode
          widgets={discoveryWidgets}
          plan={plan}
          items={items}
          pillars={pillars}
          pillarsById={byId}
          adopted={adopted}
          isAuthor={isAuthor}
        />
      )}
    </DetailTemplate>
  )

  return (
    <div className="mx-auto w-full max-w-2xl">
      <JourneyCelebrationStage />

      {isAuthor && preview && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface px-4 py-2.5">
          <span className="text-sm text-muted">Preview — how others see your journey.</span>
          <Link
            href={`/journeys/${plan.slug}`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
          >
            <Pencil className="h-3.5 w-3.5" /> Back to editing
          </Link>
        </div>
      )}

      {header}
    </div>
  )
}

// ── Active mode — composed per the resolved widget order ──────────────────────
function ActiveMode({
  widgets,
  plan,
  progress,
  profileId,
  pillars,
}: {
  widgets: WidgetId[]
  plan: import('@/lib/journey-plans').JourneyPlan
  progress: import('@/lib/journey-plans').JourneyProgress
  profileId: string
  pillars: import('@/lib/pillars').Pillar[]
}) {
  const accent = plan.accent
  const checklistRows: ChecklistRow[] = progress.items.map((it) => ({
    key: it.id,
    practiceId: it.practice?.id ?? null,
    title: it.tierContent?.title ?? it.practice?.title ?? 'Practice',
    cadence: it.cadence ?? it.practice?.cadence ?? null,
    target: it.target,
    loggedThisWeek: it.loggedThisWeek,
    met: it.met,
    resolvedTier: it.resolvedTier,
  }))
  const resolvedTier = progress.items[0]?.resolvedTier ?? 'adept'

  const node = (id: WidgetId): React.ReactNode => {
    switch (id) {
      case 'next-step':
        return <NextStepCard progress={progress} accent={accent} />
      case 'progress':
        return <SeasonProgress progress={progress} accent={accent} />
      case 'checklist':
        return checklistRows.length > 0 ? (
          <section>
            <h2 className="mb-3 text-sm font-bold tracking-tight text-text">The full path</h2>
            <StepChecklist rows={checklistRows} planTitle={plan.title} />
          </section>
        ) : null
      case 'gamification':
        return (
          <Suspense fallback={<PanelSkeleton rows={1} />}>
            <GamificationPanel profileId={profileId} />
          </Suspense>
        )
      case 'streak':
        return (
          <Suspense fallback={<PanelSkeleton rows={1} />}>
            <StreakStrip profileId={profileId} />
          </Suspense>
        )
      case 'companions':
        return (
          <Suspense fallback={<PanelSkeleton rows={1} />}>
            <CoopMeter profileId={profileId} planId={plan.id} fallbackCompanions={progress.circleCompanions} />
          </Suspense>
        )
      case 'practice-guide':
        return <PracticeGuideBlock intro={plan.intro} />
      case 'season-context':
        return (
          <Suspense fallback={<PanelSkeleton rows={1} />}>
            <SeasonContext questId={plan.quest_id} seasonWeek={progress.seasonWeek} />
          </Suspense>
        )
      default:
        return null
    }
  }

  return (
    <div className="space-y-5">
      {widgets.map((id) => {
        const el = node(id)
        return el ? <div key={id}>{el}</div> : null
      })}

      {/* The member tier-override control — always available in active mode (not a layout
          widget; it's a per-member setting that travels with the page, not the plan). */}
      <TierControl planId={plan.id} slug={plan.slug} resolvedTier={resolvedTier} />

      <p className="text-center text-xs text-subtle">
        Pillars: {pillars.filter((p) => progress.items.some((it) => (it.domain_id ?? it.practice?.domain_id) === p.id)).map((p) => p.name).join(' · ') || '—'}
      </p>
    </div>
  )
}

// ── Discovery mode — composed per the resolved widget order ───────────────────
function DiscoveryMode({
  widgets,
  plan,
  items,
  pillars,
  pillarsById,
  adopted,
  isAuthor,
}: {
  widgets: WidgetId[]
  plan: import('@/lib/journey-plans').JourneyPlan
  items: import('@/lib/journey-plans').JourneyPlanItem[]
  pillars: import('@/lib/pillars').Pillar[]
  pillarsById: Map<string, import('@/lib/pillars').Pillar>
  adopted: boolean
  isAuthor: boolean
}) {
  const accent = plan.accent

  const node = (id: WidgetId): React.ReactNode => {
    switch (id) {
      case 'story':
        return <StoryBlock intro={plan.intro} />
      case 'path':
        return <PathBlock items={items} pillarsById={pillarsById} accent={accent} />
      case 'pillar-balance':
        return <PillarBalanceBlock items={items} pillars={pillars} />
      case 'social-proof':
        return <SocialProofBlock count={plan.adopt_count} />
      case 'reward-preview':
        return <RewardPreviewBlock gems={plan.completion_gems} />
      case 'completion-rule':
        return <CompletionRuleBlock targetWeeks={plan.target_weeks} />
      default:
        return null
    }
  }

  return (
    <div className="space-y-5">
      {widgets.map((id) => {
        const el = node(id)
        return el ? <div key={id}>{el}</div> : null
      })}

      {/* Adopt / Remix — the discovery CTA (shown to everyone but the author's own editor). */}
      {!isAuthor && (
        <AdoptRemixBlock
          planId={plan.id}
          slug={plan.slug}
          adopted={adopted}
          canAdopt={items.length > 0}
          adoptAction={adoptPlanAction}
          forkAction={forkPlanAction}
        />
      )}
    </div>
  )
}

function PanelSkeleton({ rows }: { rows: number }) {
  return (
    <div className="space-y-2.5" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-20 animate-pulse rounded-2xl bg-surface-elevated/60" />
      ))}
    </div>
  )
}
