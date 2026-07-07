import { Suspense } from 'react'
import { getSpaceContentData, type SpaceContentData } from '@/lib/spaces/content-data'
import { defaultPrimaryCtaLabel } from '@/lib/spaces/profile-config'
import type { ProfileBlockId } from '@/lib/spaces/profile-blocks'
import { resolveSpaceAuthoredContent } from '@/lib/spaces/authored-content'
import { type SpaceProfileContext } from '@/lib/spaces/profile-modules'
import { effectiveProfileLayout } from '@/lib/spaces/profile-layout'
import { resolveRows, type EntityLayout } from '@/lib/entity-blocks/layout'
import { resolveDataHeader, pickerSelection } from '@/lib/entity-blocks/block-content'
import { blocksForKind, entityBlockById } from '@/lib/entity-blocks/registry'
import { EntityGrid } from '@/components/entity-blocks/entity-grid'
import { OwnerBlockFrame } from '@/components/entity-blocks/owner-block-frame'
import { ContentBlockView, BlockStyleFrame, hasContent } from '@/components/entity-blocks/content-block-view'
import { DesignBlockView, isDesignBlock } from '@/components/entity-blocks/design-block-view'

import { AboutBlock } from './about'
import { StoryBlock } from './story'
import { HighlightsBlock } from './highlights'
import { OfferingsBlock } from './offerings'
import { BookingBlock } from './booking'
import { EventsBlock } from './events'
import { PracticesBlock } from './practices'
import { CirclesBlock } from './circles'
import { TeamBlock } from './team'
import { ReviewsBlock } from './reviews'
import { FaqBlock } from './faq'
import { UpdatesBlock } from './updates'
import { ContactBlock } from './contact'
import { BusinessBlock } from './business'
import { JourneysBlock } from './journeys'
import { SPACE_CONTENT_BLOCKS, type SpaceContentBlockComponent } from './authored-content'

// THE MODULE-ENGINE SPACE PROFILE RENDERER (Epic 1.7, S2 staff-preview). A non-Puck, block-style
// render of a space profile: it resolves the ordered ProfileBlockId layout from the S1 registry + the
// space's live function set (resolveProfileLayout, pure), fetches every section's live data in ONE
// request-cached pass (getSpaceContentData, no N+1), then renders each block in layout order through a
// static id -> component map. Each section sits in its OWN <Suspense fallback={null}> so a slow section
// never blocks the ones above it (PAGE-FRAMEWORK §5), and each block is FAIL-SAFE (renders nothing when
// its data is absent), so the whole render degrades to an empty column rather than a broken page.
//
// LIVE: this IS the space profile Home body (ADR-508 U3 cutover) — the (profile)/page.tsx visitor render
// mounts it with the operator's effective GRID, and the staff /profile-preview route mounts it the same
// way. Both feed the function-only palette (blocksForKind('space')), so the two renders stay uniform.

type BlockComponent = (props: {
  space: SpaceProfileContext
  data: SpaceContentData
  /** The owner's EFFECTIVE header for this block (ADR-542): the authored eyebrow/title override, already
   *  folded over the block's default (resolveDataHeader), so the block draws the owner's real header. */
  header?: { eyebrow?: string; heading?: string }
  /** About/Story only (ADR-542): the owner's inline-authored body, taking precedence over the data bag. */
  authoredBody?: string
  /** A function-backed block's picker SELECTION (ADR-573 item 5): the item ids the operator chose to
   *  feature. EMPTY / absent === show EVERY live item (item 7's default). Each block intersects this with
   *  its live ids (resolvePickedIds), so a stale id is dropped and only real items ever render. */
  featuredIds?: string[]
}) => React.ReactNode

/** The id -> section component map (parity with the S1 PROFILE_BLOCKS registry ids). Adding a section
 *  is one row here + its block file. */
export const SPACE_PROFILE_BLOCKS: Record<ProfileBlockId, BlockComponent> = {
  about: AboutBlock,
  story: StoryBlock,
  highlights: HighlightsBlock,
  offerings: OfferingsBlock,
  booking: BookingBlock,
  events: EventsBlock,
  practices: PracticesBlock,
  circles: CirclesBlock,
  team: TeamBlock,
  reviews: ReviewsBlock,
  faq: FaqBlock,
  updates: UpdatesBlock,
  contact: ContactBlock,
  business: BusinessBlock,
}

/** DATA blocks (ADR-542) that live in the unified registry but NOT the S1 ProfileBlockId set: `journeys`
 *  auto-pulls the space's hosted journeys. Keyed by unified id; read via Object.hasOwn so a user-ish id
 *  never reaches the prototype chain. */
const EXTRA_DATA_BLOCKS: Record<string, BlockComponent> = {
  journeys: JourneysBlock,
}

/** The unified grid vocabulary keys blocks by registry id; this S1 renderer keys by ProfileBlockId. The
 *  only divergence is `stats` (unified) vs `highlights` (S1); every other shared DATA id matches. The
 *  unified content ids (callout/features/heading/text/image/gallery/...) are handled separately by
 *  ContentBlockView / SPACE_CONTENT_BLOCKS, and the ADR-542 extra data blocks by EXTRA_DATA_BLOCKS, so
 *  they never reach this DATA map. */
function toProfileBlockId(id: string): ProfileBlockId | null {
  const normalized = id === 'stats' ? 'highlights' : id
  return normalized in SPACE_PROFILE_BLOCKS ? (normalized as ProfileBlockId) : null
}

type SpaceAuthored = ReturnType<typeof resolveSpaceAuthoredContent>

/** Render ONE space block by unified id into its fail-safe <Suspense> node (no owner frame), wrapped in its
 *  per-block STYLE frame (ADR-528). CONTENT ids render the operator's inline-authored content (from the
 *  layout's `content` bag, falling back to any legacy Puck-doc content); DATA ids render live space data
 *  under the owner's authored eyebrow/title (folded into the block's own header). Shared by the live render
 *  and the render-all-once node map.
 *  Unknown / empty id → null. */
function renderSpaceBlock(
  id: string,
  space: SpaceProfileContext,
  data: SpaceContentData,
  authored: SpaceAuthored,
  layout: EntityLayout | null,
  styled = true,
): React.ReactNode {
  if (id.length === 0) return null
  const block = entityBlockById(id)
  const style = layout?.style?.[id]
  const contentProps = layout?.content?.[id]

  let inner: React.ReactNode
  if (isDesignBlock(id)) {
    // The five design blocks (2026): rendered from their authored bag by the design-block adapter. A design
    // block has no live-data fallback, so an empty bag renders the component's own honest-empty state.
    inner = <DesignBlockView id={id} props={contentProps ?? {}} />
  } else if (block && block.category === 'content') {
    if (hasContent(id, contentProps)) {
      inner = <ContentBlockView id={id} props={contentProps ?? {}} />
    } else {
      const ContentBlock = (SPACE_CONTENT_BLOCKS as Record<string, SpaceContentBlockComponent | undefined>)[id]
      inner = ContentBlock ? <ContentBlock content={authored} /> : null
    }
  } else if (Object.hasOwn(EXTRA_DATA_BLOCKS, id)) {
    const Block = EXTRA_DATA_BLOCKS[id]
    // The owner's authored eyebrow/title REPLACE the block's real header (ADR-542), default-filled. A
    // function-backed block also carries its picker selection (ADR-573 item 5); empty === show all (item 7).
    inner = (
      <Block space={space} data={data} header={resolveDataHeader(id, contentProps)} featuredIds={pickerSelection(contentProps)} />
    )
  } else {
    const blockId = toProfileBlockId(id)
    if (!blockId) return null
    const Block = SPACE_PROFILE_BLOCKS[blockId]
    // About + Story carry the owner's inline-authored body (ADR-542); it takes precedence over the data bag
    // inside the block. Other data blocks ignore the prop. Every data block draws the owner's real header
    // (authored eyebrow/title over the block default) — no separate header stacked above it. A function-backed
    // block (offerings/events/team/circles) also gets its picker selection (ADR-573 item 5); an empty
    // selection means show every live item (item 7's default).
    const authoredBody =
      (id === 'about' || id === 'story') && typeof contentProps?.body === 'string' ? contentProps.body : undefined
    inner = (
      <Block
        space={space}
        data={data}
        header={resolveDataHeader(id, contentProps)}
        authoredBody={authoredBody}
        featuredIds={pickerSelection(contentProps)}
      />
    )
  }
  if (inner == null) return null
  // `styled=false` (the owner live-preview node map) leaves the style frame to LiveProfileGrid, which
  // applies it CLIENT-side from the shared store so a style edit shows instantly (no server round-trip).
  const body = styled ? <BlockStyleFrame style={style}>{inner}</BlockStyleFrame> : inner
  return (
    <Suspense key={id} fallback={null}>
      {body}
    </Suspense>
  )
}

/**
 * Render EVERY candidate space block once, server-side, into a node map keyed by unified block id (ADR-516
 * Phase D — the space mirror of renderMemberBlockNodes). This is what makes the in-rail builder's
 * bench↔page placement instant: the node already exists, so placing/benching a block just moves it in the
 * LiveProfileGrid — no round-trip. Each block already sits in its own <Suspense fallback={null}> and
 * renders nothing when its slice is absent, so an unplaced block is cheap and fail-safe.
 */
export function renderSpaceBlockNodes(
  space: SpaceProfileContext,
  data: SpaceContentData,
  authored: SpaceAuthored,
  layout: EntityLayout | null,
): Record<string, React.ReactNode> {
  const nodes: Record<string, React.ReactNode> = {}
  // styled=false: LiveProfileGrid applies each block's style frame client-side (instant live style edits).
  for (const b of blocksForKind('space')) nodes[b.id] = renderSpaceBlock(b.id, space, data, authored, layout, false)
  return nodes
}

export async function SpaceProfileModules({
  space,
  layout,
  grid,
  editHref,
}: {
  space: SpaceProfileContext
  /** Override the derived layout (e.g. a caller-supplied order). Omitted = the operator's saved
   *  block-picker layout merged over the fresh default (effectiveProfileLayout), fail-safe. Ignored when
   *  `grid` is supplied. */
  layout?: ProfileBlockId[]
  /** The GRID layout (U2b) — an effective EntityLayout (from mergeEntityLayout) in the unified block
   *  vocabulary. When present its template + slots drive the render; otherwise the flat list is used. */
  grid?: EntityLayout | null
  /** OWNER click-to-edit (Spaces item 6): given a block id, return the href of the surface's existing
   *  layout editor. When set, each block is wrapped in an OwnerBlockFrame that overlays a hover pencil
   *  linking there. Omitted (the default, and every visitor / non-owner render) leaves the render
   *  byte-identical — no frame, no overlay. */
  editHref?: (blockId: string) => string
}) {
  // ONE request-cached pass for every section's live data, with the SAME identity/profile inputs the
  // live Puck landing feeds, so the preview shows the operator's real content (not editor placeholders).
  const data = await getSpaceContentData(space.id, {
    name: space.brandName,
    type: space.type,
    logoUrl: space.logoUrl,
    coverUrl: space.coverUrl,
    tagline: space.tagline,
    primaryCta: { label: defaultPrimaryCtaLabel(space.type), href: `/spaces/${space.slug}/book` },
    slug: space.slug,
    profile: space.profile,
  })

  // The operator's AUTHORED content, grouped by unified content id (pure, sync, fail-safe to an empty bag
  // when they have written none). Rendered by the content ids alongside the live-data section blocks, so
  // authored headings/text/images the operator wrote in their Home doc appear as their own blocks.
  const authored = resolveSpaceAuthoredContent(space.preferences, space.brandName)

  // OWNER wrap (fail-safe): when `editHref` is set, sheathe a block in the click-to-edit frame; the frame
  // collapses itself when the block renders honest-empty, so a hidden block never leaves a phantom pencil.
  // Absent (visitor / non-owner), the block returns exactly as before. The `key` moves onto whichever
  // node is outermost, so React keys the list the same either way.
  const wrap = (id: string, node: React.ReactNode) =>
    editHref ? (
      <OwnerBlockFrame key={id} blockId={id} editHref={editHref(id)} label={id}>
        {node}
      </OwnerBlockFrame>
    ) : (
      node
    )

  const renderBlock = (id: string) => {
    const node = renderSpaceBlock(id, space, data, authored, grid ?? null)
    return node === null ? null : wrap(id, node)
  }

  // GRID path (ADR-516): resolve the effective freeform rows and render them. Fail-safe: unknown ids drop.
  if (grid) {
    return (
      <div className="@container/profile">
        <EntityGrid rows={resolveRows(grid, 'space')} renderBlock={renderBlock} />
      </div>
    )
  }

  // Flat single-column fallback (S2). `@container/profile`: the sections size to THIS slot's width, not
  // the viewport, so the module render drops cleanly into any column.
  const resolved = layout ?? effectiveProfileLayout(space, space.preferences)
  return <div className="@container/profile space-y-14">{resolved.map((id) => renderBlock(id))}</div>
}
