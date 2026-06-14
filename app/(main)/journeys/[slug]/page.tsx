import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { Globe, Lock, Link2, Pencil, Sparkles, Flame } from 'lucide-react'
import { DetailTemplate } from '@/components/templates'
import { getCallerProfile } from '@/lib/auth'
import { getJourneyView, getPlan, getPlanAuthor } from '@/lib/journey-plans'
import { getPillars, pillarsById as indexPillars } from '@/lib/pillars'
import { accentColor, accentTint } from '@/lib/studio/accents'
import { JOURNEY_ICON_MAP, DefaultJourneyIcon } from '@/lib/studio/journey-icons'
import { adoptPlanAction, forkPlanAction } from '../actions'
import { enabledWidgets, type WidgetId } from '@/lib/journey-page-config'
import {
  StoryBlock,
  PathBlock,
  PillarBalanceBlock,
  SocialProofBlock,
  RewardPreviewBlock,
  CompletionRuleBlock,
  AdoptRemixBlock,
} from '@/components/journey/discovery-widgets'

export const dynamic = 'force-dynamic'

// The one Journey page (docs/JOURNEYS.md §10). It flips between three faces:
//   • AUTHOR    → redirects to the v2 editor at /journeys/[slug]/edit (identity + delivery +
//                 publish settings and the Phase → Module → Lesson structure tree, ADR-252 J5).
//   • DISCOVERY → not adopted / visitor: the story, the path, pillar balance, social proof,
//                 reward + completion rule, adopt/remix CTA.
//   • ACTIVE    → adopted: redirects to the v2 lesson player at /journeys/[slug]/learn
//                 (ADR-252, J5 cutover). The legacy season course-player + Studio builder are retired.
// Discovery composes widgets in the order resolved by normalizePageConfig(page_config, mode).

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
    plan.summary ?? 'A seasonal set of practices to move through, on your own or with your Circle.'
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
  const { plan, items, adopted, progress } = view

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

  // ACTIVE → the v2 lesson player (ADR-252, J5). An adopted learner goes straight to the
  // player; a previewing author stays on the discovery view.
  if (adopted && progress && !preview) redirect(`/journeys/${plan.slug}/learn`)

  // Only the DISCOVERY face composes a page_config widget stack.
  const discoveryWidgets = enabledWidgets(plan.page_config, 'discovery').map((w) => w.id)

  const header = (
    <DetailTemplate
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
        <span className="block space-y-1.5">
          {plan.summary && <span className="block leading-relaxed">{plan.summary}</span>}
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
        </span>
      }
    >
      {/* Cover hero (docs/JOURNEYS-DESIGN.md §3: 16:9 photographic, framing only). */}
      {plan.cover_image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={plan.cover_image}
          alt=""
          className="mb-5 h-48 w-full rounded-2xl border border-border object-cover sm:h-64"
        />
      )}
      <DiscoveryMode
        widgets={discoveryWidgets}
        plan={plan}
        items={items}
        pillars={pillars}
        pillarsById={byId}
        adopted={adopted}
        isAuthor={isAuthor}
      />
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

      {header}
    </>
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
