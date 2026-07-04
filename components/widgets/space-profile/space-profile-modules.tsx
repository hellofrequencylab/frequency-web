import { Suspense } from 'react'
import { getSpaceContentData, type SpaceContentData } from '@/lib/spaces/content-data'
import { defaultPrimaryCtaLabel } from '@/lib/spaces/profile-config'
import type { ProfileBlockId } from '@/lib/spaces/profile-blocks'
import { resolveSpaceAuthoredContent } from '@/lib/spaces/authored-content'
import { type SpaceProfileContext } from '@/lib/spaces/profile-modules'
import { effectiveProfileLayout } from '@/lib/spaces/profile-layout'
import { resolveRows, type EntityLayout } from '@/lib/entity-blocks/layout'
import { blocksForKind } from '@/lib/entity-blocks/registry'
import { EntityGrid } from '@/components/entity-blocks/entity-grid'
import { OwnerBlockFrame } from '@/components/entity-blocks/owner-block-frame'

import { AboutBlock } from './about'
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
import { SPACE_CONTENT_BLOCKS, type SpaceContentBlockComponent } from './authored-content'

// THE MODULE-ENGINE SPACE PROFILE RENDERER (Epic 1.7, S2 staff-preview). A non-Puck, block-style
// render of a space profile: it resolves the ordered ProfileBlockId layout from the S1 registry + the
// space's live function set (resolveProfileLayout, pure), fetches every section's live data in ONE
// request-cached pass (getSpaceContentData, no N+1), then renders each block in layout order through a
// static id -> component map. Each section sits in its OWN <Suspense fallback={null}> so a slow section
// never blocks the ones above it (PAGE-FRAMEWORK §5), and each block is FAIL-SAFE (renders nothing when
// its data is absent), so the whole render degrades to an empty column rather than a broken page.
//
// STAFF-PREVIEW ONLY: nothing live reads this yet — the live profile stays the Puck landing
// (components/spaces/space-landing.tsx). This validates the module render beside it.

type BlockComponent = (props: { space: SpaceProfileContext; data: SpaceContentData }) => React.ReactNode

/** The id -> section component map (parity with the S1 PROFILE_BLOCKS registry ids). Adding a section
 *  is one row here + its block file. */
export const SPACE_PROFILE_BLOCKS: Record<ProfileBlockId, BlockComponent> = {
  about: AboutBlock,
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

/** The unified grid vocabulary keys blocks by registry id; this S1 renderer keys by ProfileBlockId. The
 *  only divergence is `stats` (unified) vs `highlights` (S1); every other shared DATA id matches. The
 *  unified content ids (heading/text/image/gallery/quote/embed/divider) are handled separately by
 *  SPACE_CONTENT_BLOCKS (the operator's authored content), so they never reach this DATA map. */
function toProfileBlockId(id: string): ProfileBlockId | null {
  const normalized = id === 'stats' ? 'highlights' : id
  return normalized in SPACE_PROFILE_BLOCKS ? (normalized as ProfileBlockId) : null
}

type SpaceAuthored = ReturnType<typeof resolveSpaceAuthoredContent>

/** Render ONE space block by unified id into its fail-safe <Suspense> node (no owner frame). CONTENT ids
 *  render the operator's authored blocks; DATA ids render live space data. Shared by the live render and
 *  the render-all-once node map. Unknown / empty id → null. */
function renderSpaceBlock(
  id: string,
  space: SpaceProfileContext,
  data: SpaceContentData,
  authored: SpaceAuthored,
): React.ReactNode {
  if (id.length === 0) return null
  const ContentBlock = (SPACE_CONTENT_BLOCKS as Record<string, SpaceContentBlockComponent | undefined>)[id]
  if (ContentBlock) {
    return (
      <Suspense key={id} fallback={null}>
        <ContentBlock content={authored} />
      </Suspense>
    )
  }
  const blockId = toProfileBlockId(id)
  if (!blockId) return null
  const Block = SPACE_PROFILE_BLOCKS[blockId]
  return (
    <Suspense key={id} fallback={null}>
      <Block space={space} data={data} />
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
): Record<string, React.ReactNode> {
  const nodes: Record<string, React.ReactNode> = {}
  for (const b of blocksForKind('space')) nodes[b.id] = renderSpaceBlock(b.id, space, data, authored)
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
    const node = renderSpaceBlock(id, space, data, authored)
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
