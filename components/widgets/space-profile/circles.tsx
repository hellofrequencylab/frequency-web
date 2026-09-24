import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import type { SpaceContentData, SpaceCircleItem } from '@/lib/spaces/content-data'
import type { SpaceProfileContext } from '@/lib/spaces/profile-modules'
import { gridColumns, resolvePickedIds } from '@/lib/entity-blocks/block-content'
import { Eyebrow } from '@/components/page-editor/blocks/kit'
import { CircleCard } from '@/components/circles/circle-card'
import { spaceCircleToCardData } from '@/lib/circles/space-card-data'
import { getMyProfileId } from '@/lib/auth'
import { myActiveCircleIds } from '@/lib/circles/store'
import { ModuleSection } from './section'

// CIRCLES — the Space's live circles, drawn as the SAME card every other circle grid on the site
// draws (CircleCard -> EntityCard), composed whole rather than re-authored.
//
// WHAT THIS BLOCK USED TO BE, so the next reader does not re-derive it. It rendered a bespoke
// `<ul>` of bordered links carrying three things: name, about, member count. Two rows above it on
// the same page the Events block composed the real EventCard, cover photo and all, so a Space's
// Home read as two different design systems stacked on top of each other. The circles were not
// missing data either — `listPublicSpaceCircles`' own COLS has always selected image_url, type,
// member_cap, access, status, neighborhood and is_space_primary; the block's projection
// (SpaceCircleItem) simply threw all of it away and then drew what little was left. So this is not
// a new card: it is the existing one, finally fed.
//
// FALLBACK IS THE COMMON CASE, not the edge. Only a small minority of circles carry an uploaded
// cover, so CircleCard's gradient-and-glyph fallback is what most of this grid will actually show.
// That is deliberate and it is why the card is used whole: the fallback is part of the shared card
// and looks composed, where a hand-rolled cover would have left an empty frame.
//
// FAIL-SAFE: no visible circles, no section (the honest-empty rule — a Space with nothing to show
// renders nothing rather than an empty shell).

/** The grid, matching the Events block's cards view so the two read as one page. */
const COLUMN_CLASS: Record<2 | 3 | 4, string> = {
  2: 'grid grid-cols-1 gap-4 sm:grid-cols-2',
  3: 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3',
  4: 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4',
}

/** The block header, composed from the same atoms every sibling block uses (the shared Eyebrow atom
 *  + the `font-display` face), so it re-skins with the Space's theme and brand accent exactly as the
 *  Events header beside it does. */
function CirclesHeader({ eyebrow, heading }: { eyebrow?: string; heading?: string }) {
  if (!eyebrow && !heading) return null
  return (
    <div className="mb-6">
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      {heading && (
        <h2 className="font-display text-page-title uppercase tracking-tight text-balance text-text sm:text-3xl">
          {heading}
        </h2>
      )}
    </div>
  )
}

/** The grid itself. ASYNC so it can resolve the viewer's own circles: without that every card
 *  offers "Join" to someone who is already a member, which is not a nit but a false statement on a
 *  live page. `myActiveCircleIds` is React-cached, so the Circles tab and this block share one read
 *  per request. Sits inside the block's own <Suspense> (renderSpaceBlock), so a slow read never
 *  blocks the sections above it — the same shape the Features data-source view uses. */
async function CirclesGrid({ circles, columns }: { circles: SpaceCircleItem[]; columns: 2 | 3 | 4 }) {
  const mine = await myActiveCircleIds(await getMyProfileId())
  return (
    <div className={COLUMN_CLASS[columns]}>
      {circles.map((c) => (
        <CircleCard key={c.id} circle={spaceCircleToCardData(c)} isMember={mine.has(c.id)} />
      ))}
    </div>
  )
}

export function CirclesBlock({
  data,
  header,
  featuredIds,
  content,
}: {
  space: SpaceProfileContext
  data: SpaceContentData
  header?: { eyebrow?: string; heading?: string }
  featuredIds?: string[]
  content?: Record<string, unknown>
}) {
  const all = data.community ?? []
  // The picker (ADR-573 item 5) features only the chosen circles, in order; empty === show all (item 7).
  const picked = resolvePickedIds(featuredIds ?? [], all.map((c) => c.id))
  const byId = new Map(all.map((c) => [c.id, c]))
  const circles = picked.map((id) => byId.get(id)).filter((c): c is SpaceCircleItem => Boolean(c))
  if (circles.length === 0) return null

  const columns = gridColumns(content)
  const allHref = data.communityHref ?? null

  return (
    <ModuleSection anchor="circles">
      <CirclesHeader eyebrow={header?.eyebrow ?? 'Join in'} heading={header?.heading ?? 'Circles'} />
      <CirclesGrid circles={circles} columns={columns} />
      {allHref && (
        // "All circles", not "See all": this block shows a capped handful and cannot honestly claim
        // there are more, so the link names its DESTINATION rather than a quantity. The old block
        // accepted this link and was never passed one, so on a live Space profile it never rendered.
        <Link
          href={allHref}
          className="mt-4 inline-flex items-center gap-1 text-body-sm font-semibold text-primary-strong hover:text-primary"
        >
          All circles
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      )}
    </ModuleSection>
  )
}
