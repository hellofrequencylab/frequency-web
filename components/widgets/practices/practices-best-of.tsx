import { headers } from 'next/headers'
import Link from 'next/link'
import { Dumbbell, Route, TrendingUp, Users2, Flame, Clock } from 'lucide-react'
import { getMyProfileId } from '@/lib/auth'
import { getLibrary, getMyRatings, typeLabel, hrefFor, type ContentType, type LibraryItem } from '@/lib/library'
import { EntityCard } from '@/components/cards/entity-card'
import { SectionHeader } from '@/components/ui/section-header'
import { UnderlineTabs } from '@/components/ui/underline-tabs'
import { EmptyState } from '@/components/ui/empty-state'
import { RateButton } from '@/components/library/rate-button'
import { BEST_OF_ANCHOR, BEST_OF_LANES, BEST_OF_MAX, BEST_OF_PREVIEW, bestOfHref, parseBestOf } from './best-of-view'

// Layout module (ADR-270/294): the community's ranked best-of catalog, practices AND journeys in one
// list. This was the whole /library page until the owner ruled one front door (LIVE-681, ADR-1678):
// /library is now a 308 to /practices and this block carries what the Library held that /practices
// did not, namely the journeys beside the practices, the best-of rank (adoptions, completions,
// ratings, recency, endorser rank, featured first), and the love rating that feeds that rank.
//
// URL-driven like practices-library: searchParams never reach a nested module, so it reads the
// page's query from the `x-search` header the proxy stamps (proxy.ts). Its keys (`type`, `best`)
// are its own, and its links keep every other facet as it stands (best-of-view.ts).

const TYPE_ICON: Record<ContentType, typeof Dumbbell> = { practice: Dumbbell, journey: Route }
const TYPE_TONE: Record<ContentType, string> = {
  practice: 'bg-primary-bg text-primary-strong',
  journey: 'bg-success-bg text-success',
}

export async function PracticesBestOf() {
  const search = (await headers()).get('x-search') ?? ''
  const { type, expanded } = parseBestOf(search)

  const profileId = await getMyProfileId()
  // Ask for one past the preview so "Show all" appears only when there is more to show.
  const [items, myRatings] = await Promise.all([
    getLibrary({ type, limit: expanded ? BEST_OF_MAX : BEST_OF_PREVIEW + 1 }),
    profileId ? getMyRatings(profileId) : Promise.resolve(new Set<string>()),
  ])
  const shown = expanded ? items : items.slice(0, BEST_OF_PREVIEW)
  const more = !expanded && items.length > BEST_OF_PREVIEW

  const lane = type ?? 'all'

  return (
    <section id={BEST_OF_ANCHOR} className="scroll-mt-20">
      <SectionHeader
        title="Best of the library"
        action={
          <Link href="/journeys" className="text-meta font-semibold text-primary-strong hover:underline">
            Browse Journeys
          </Link>
        }
      />
      <div className="mb-4">
        <UnderlineTabs
          label="Best of the library"
          activeHref={bestOfHref(search, { lane })}
          tabs={BEST_OF_LANES.map((l) => ({ href: bestOfHref(search, { lane: l.key }), label: l.label }))}
        />
      </div>

      {shown.length === 0 ? (
        <EmptyState
          icon={TrendingUp}
          title="Nothing ranked yet"
          description="Create a practice or build a journey. Once a leader approves it, it shows up here, ranked."
        />
      ) : (
        <>
          {/* Flexes to the slot it lands in (container queries), like the practice library. */}
          <ul className="grid grid-cols-1 gap-4 @md:grid-cols-2 @3xl:grid-cols-3">
            {shown.map((item) => (
              <li key={`${item.contentType}:${item.id}`}>
                <BestOfCard
                  item={item}
                  signedIn={!!profileId}
                  rated={myRatings.has(`${item.contentType}:${item.id}`)}
                />
              </li>
            ))}
          </ul>
          {(more || expanded) && (
            <p className="mt-4 text-body-sm">
              <Link
                href={bestOfHref(search, { expanded: !expanded })}
                className="font-semibold text-primary-strong hover:underline"
              >
                {expanded ? 'Show the top picks' : 'Show all'}
              </Link>
            </p>
          )}
        </>
      )}
    </section>
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

// Composed on the framework browse card (EntityCard): the meta row carries the time chip + the
// adoption/completion/score stats; the rate toggle sits in the footer, outside the card's link.
function BestOfCard({ item, rated, signedIn }: { item: LibraryItem; rated: boolean; signedIn: boolean }) {
  const Icon = TYPE_ICON[item.contentType]
  const time = timeChipFor(item)
  return (
    <EntityCard
      href={hrefFor(item)}
      coverAspect="short"
      cover={
        item.coverImage ? (
          // Raw <img> (not next/image): cover URLs are arbitrary operator/host URLs the
          // image loader's allowlist would reject.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.coverImage} alt="" className="h-full w-full object-cover" />
        ) : (
          // Coded fallback so every card leads with a header: a calm type-toned wash with the
          // content icon centered (practices carry no cover_image from the RPC).
          <div className={`flex h-full w-full items-center justify-center ${TYPE_TONE[item.contentType]}`}>
            <Icon className="h-8 w-8 opacity-70" />
          </div>
        )
      }
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
            <span className="inline-flex min-w-0 items-center gap-1 font-medium text-muted" title="Time">
              <Clock className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{time}</span>
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
        // Rating needs a member (rateContent refuses a visitor), so a visitor sees the count
        // in the meta row's score and no toggle.
        signedIn ? (
          <div className="flex justify-end">
            <RateButton type={item.contentType} id={item.id} count={item.ratings} rated={rated} />
          </div>
        ) : undefined
      }
    />
  )
}
