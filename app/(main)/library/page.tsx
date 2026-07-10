import { redirect } from 'next/navigation'
import { Dumbbell, Megaphone, Route, TrendingUp, Users2, Flame, Clock } from 'lucide-react'
import { getCallerProfile } from '@/lib/auth'
import { IndexTemplate } from '@/components/templates'
import { EntityCard } from '@/components/cards/entity-card'
import { UnderlineTabs } from '@/components/admin/underline-tabs'
import { EmptyState } from '@/components/ui/empty-state'
import { getLibrary, getMyRatings, typeLabel, hrefFor, type ContentType, type LibraryItem } from '@/lib/library'
import { resolvePageContent, pageContentMetadata } from '@/lib/page-content'
import { getPageHeaderImage } from '@/lib/page-settings/store'
import { RateButton, CreateMenu } from './interactive'

export const dynamic = 'force-dynamic'

// Coded defaults for the operator-editable content (ADR-180) — shared by the
// page header and the SEO metadata below.
const CONTENT_FALLBACK = {
  title: 'Library',
  description: "The community's best practices, programs, and journeys. Created by members, approved by leadership, ranked by what's actually working.",
}

// Operator-set title/description also drive <title> + og/twitter cards (PX.2).
export function generateMetadata() {
  return pageContentMetadata('/library', CONTENT_FALLBACK)
}

const TYPES: { key: ContentType | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'practice', label: 'Practices' },
  { key: 'program', label: 'Programs' },
  { key: 'journey', label: 'Journeys' },
]
const TYPE_ICON: Record<ContentType, typeof Dumbbell> = { practice: Dumbbell, program: Megaphone, journey: Route }
const TYPE_TONE: Record<ContentType, string> = {
  practice: 'bg-primary-bg text-primary-strong',
  program: 'bg-signal-bg text-signal-strong',
  journey: 'bg-success-bg text-success',
}

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; pillar?: string }>
}) {
  const caller = await getCallerProfile()
  if (!caller) redirect('/feed')

  const { type: typeParam, pillar } = await searchParams
  const type = (['practice', 'program', 'journey'].includes(typeParam ?? '') ? typeParam : null) as ContentType | null

  const [items, myRatings] = await Promise.all([
    // Surface the full catalog — every approved/public practice, program, AND journey
    // (the `community_library` RPC unions all three). `type`/`pillar` stay as the tab +
    // filter, both defaulting to null (the "All" tab) so nothing is hidden. We ask for
    // the RPC's max so a published item is never silently dropped by the default cap.
    getLibrary({ type, pillar: pillar ?? null, limit: 200 }),
    getMyRatings(caller.id),
  ])

  const q = (t: string) => (t === 'all' ? '/library' : `/library?type=${t}`)

  // Operator-editable page header (ADR-180) — falls back to the coded defaults.
  const { title, description, heroImage: contentHero, ctaLabel, ctaHref } = await resolvePageContent('/library', CONTENT_FALLBACK)
  // The uniform overlay Hero Header (the Business Spaces grammar): operator image wins, else a calm
  // section default so the hero band always renders.
  const heroImage = (await getPageHeaderImage('/library')) ?? contentHero ?? '/images/site/community-1.jpg'

  return (
    <IndexTemplate
      title={title}
      description={description}
      trail={[
        { href: '/network', label: 'Community' },
        { href: '/library', label: 'Library' },
      ]}
      heroImage={heroImage}
      heroOverlay
      action={
        <div className="flex items-center gap-2">
          {/* The two guided create flows (each route carries its own canCreate gate). The
              review queue keeps living at /library/review, reachable from admin. */}
          <CreateMenu />
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
      toolbar={
        <UnderlineTabs
          activeHref={q(type ?? 'all')}
          tabs={TYPES.map((t) => ({ href: q(t.key), label: t.label }))}
        />
      }
    >
      {items.length === 0 ? (
        <EmptyState
          icon={TrendingUp}
          title="Nothing in the Library yet"
          description="Create a practice or build a journey. Once a leader approves it, it shows up here, ranked."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <LibraryCard key={`${item.contentType}:${item.id}`} item={item} rated={myRatings.has(`${item.contentType}:${item.id}`)} />
          ))}
        </div>
      )}
    </IndexTemplate>
  )
}

/** The card's time chip: '10 min · Daily' (practice) / '6 weeks · 24 lessons' (journey).
 *  FAIL-SAFE: null whenever the time fields are null (e.g. the RPC predates the
 *  library_card_times migration), so the card simply renders without it. */
function timeChipFor(item: LibraryItem): string | null {
  if (item.contentType === 'practice') {
    const parts = [item.durationMin ? `${item.durationMin} min` : null, item.cadence].filter(Boolean)
    return parts.length ? parts.join(' · ') : null
  }
  if (item.contentType === 'journey' && item.unitCount && item.unitLabel) {
    return `${item.unitCount} ${item.unitLabel}`
  }
  return null
}

// Composed on the framework browse card (EntityCard) — the meta row carries the time chip +
// the adoption/completion/score stats; the rate toggle sits in the footer, outside the link.
function LibraryCard({ item, rated }: { item: LibraryItem; rated: boolean }) {
  const Icon = TYPE_ICON[item.contentType]
  // Programs have no detail route (they render inline in the Library), so their card
  // links to the Programs tab of the catalog itself.
  const href = hrefFor(item) ?? '/library?type=program'
  const time = timeChipFor(item)
  return (
    <EntityCard
      href={href}
      anchor={
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${TYPE_TONE[item.contentType]}`}>
          <Icon className="h-4 w-4" />
        </span>
      }
      title={item.title}
      context={item.author ? `${typeLabel(item.contentType)} · by ${item.author.display_name}` : typeLabel(item.contentType)}
      description={item.summary}
      metaNoWrap
      meta={
        <>
          {time && (
            <span className="inline-flex shrink-0 items-center gap-1 font-medium text-muted" title="Time">
              <Clock className="h-3.5 w-3.5" /> {time}
            </span>
          )}
          <span className="inline-flex shrink-0 items-center gap-1" title="Adoptions">
            <Users2 className="h-3.5 w-3.5" /> {item.adoptions}
          </span>
          <span className="inline-flex shrink-0 items-center gap-1" title="Completions / real-world use">
            <Flame className="h-3.5 w-3.5" /> {item.completions}
          </span>
          <span className="inline-flex shrink-0 items-center gap-1" title="Best-of score">
            <TrendingUp className="h-3.5 w-3.5" /> {item.score}
          </span>
        </>
      }
      footer={
        <div className="flex justify-end">
          <RateButton type={item.contentType} id={item.id} count={item.ratings} rated={rated} />
        </div>
      }
    />
  )
}
