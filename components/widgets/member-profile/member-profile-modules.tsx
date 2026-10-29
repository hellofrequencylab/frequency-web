import { stackClassFor } from '@/lib/entity-blocks/density'
import type { BlockDensity } from '@/lib/entity-blocks/define-block'
import { Suspense } from 'react'
import type { SpotlightData } from '@/lib/spotlight/data'
import { defaultMemberLayout } from '@/lib/entity-blocks/context'
import type { EntityLayout } from '@/lib/entity-blocks/layout'
import type { BlockNode } from '@/lib/entity-blocks/node-tree'
import { resolveNodeRowsFor } from '@/lib/entity-blocks/node-ops'
import { entityBlockById } from '@/lib/entity-blocks/registry'
import { EntityGrid } from '@/components/entity-blocks/entity-grid'
import { OwnerBlockFrame } from '@/components/entity-blocks/owner-block-frame'
import { ContentBlockView, BlockStyleFrame, hasContent } from '@/components/entity-blocks/content-block-view'
import {
  resolveMemberBlockData,
  toMemberEntity,
  type MemberBlockProps,
} from '@/lib/entity-blocks/member-adapter'

import { AboutBlock } from './about'
import { StatsBlock } from './stats'
import { LinksBlock } from './links'
import { TopFriendsBlock } from './topfriends'
import { GuestbookBlock } from './guestbook'
import { MemberEventsBlock } from './events'
import { HeadingBlock } from './heading'
import { TextBlock } from './text'
import { ImageBlock } from './image'
import { GalleryBlock } from './gallery'
import { QuoteBlock } from './quote'
import { EmbedBlock } from './embed'
import { DividerBlock } from './divider'

// THE MODULE-ENGINE MEMBER PROFILE RENDERER (ADR-508, U2a staff/self preview). The member (Spotlight)
// mirror of SpaceProfileModules: it resolves the ordered block-id layout from the U1 registry
// (defaultMemberLayout, pure), resolves the member's per-block DATA bag ONCE from the already-fetched
// SpotlightData (resolveMemberBlockData, no new query), then renders each block in layout order through
// a static id -> component map. Each block sits in its OWN <Suspense fallback={null}> so a slow block
// never blocks the ones above it (PAGE-FRAMEWORK §5), and each block is FAIL-SAFE (renders nothing when
// its slice is absent), so the whole render degrades to an empty column rather than a broken page.
//
// THE LIVE ENGINE (ADR-522 follow-up): this module/grid render now drives BOTH the in-app profile
// (profile-spotlight-blocks) AND the public /spotlight/<handle> mini-site. The Puck Spotlight render is
// retired — the grid is the single engine end to end.
//
// NODE RENDER (E0 task 12, ADR-1832): the grid path renders NODES. Each placement is a `BlockNode` whose
// own `content` and `style` the block reads, so two Text blocks on one page each draw their own words.
// The flat path and the editor's render-all-once node map still address a block by its registry id, so
// they wrap the id in a transient node carrying the type's bag from the sibling maps; those two paths
// move to nodes with the store and the live grid (task 12b).

type MemberBlockComponent = (props: MemberBlockProps) => React.ReactNode

/** The id -> block component map (parity with the U1 registry ids that support the member kind). Adding
 *  a member block is one row here + its block file. */
export const MEMBER_PROFILE_BLOCKS: Record<string, MemberBlockComponent> = {
  about: AboutBlock,
  stats: StatsBlock,
  links: LinksBlock,
  topfriends: TopFriendsBlock,
  guestbook: GuestbookBlock,
  memberEvents: MemberEventsBlock,
  heading: HeadingBlock,
  text: TextBlock,
  image: ImageBlock,
  gallery: GalleryBlock,
  quote: QuoteBlock,
  embed: EmbedBlock,
  divider: DividerBlock,
}

/** A block addressed by registry id (the flat path, the editor's node map) as a node: the type's bag from
 *  the legacy sibling maps, and the id for its key. The LIVE-875 boundary still holds those paths to the
 *  type-keyed document, so one bag per type is exactly what they mean. */
function transientNode(id: string, layout: EntityLayout | null): BlockNode {
  const node: BlockNode = { nid: id, type: id }
  const content = layout?.content?.[id]
  if (content) node.content = content
  const style = layout?.style?.[id]
  if (style) node.style = style
  return node
}

/** Render ONE member block NODE, wrapped in its per-block STYLE frame (ADR-528/529). A CONTENT block whose
 *  authored bag is set (the node's own `content`) renders the operator's inline content; otherwise the
 *  member component renders (legacy / data-backed). `styled=false` (the live-preview node map) leaves the
 *  style frame to LiveProfileGrid so a style edit shows instantly. Unknown type → null. */
function renderMemberNode(
  node: BlockNode,
  identity: ReturnType<typeof toMemberEntity>,
  data: ReturnType<typeof resolveMemberBlockData>,
  styled = true,
): React.ReactNode {
  const id = node.type
  const block = entityBlockById(id)
  const style = node.style
  const contentProps = node.content

  let inner: React.ReactNode
  if (block && block.category === 'content' && hasContent(id, contentProps)) {
    inner = <ContentBlockView id={id} props={contentProps ?? {}} />
  } else {
    const Block = MEMBER_PROFILE_BLOCKS[id]
    if (!Block) return null
    inner = <Block member={identity} data={data} />
  }
  const body = styled ? <BlockStyleFrame style={style}>{inner}</BlockStyleFrame> : inner
  return (
    <Suspense key={node.nid} fallback={null}>
      {body}
    </Suspense>
  )
}

/**
 * Render EVERY candidate member block once, server-side, into a node map keyed by block id (ADR-516
 * Phase C). This is what makes the in-rail builder's bench↔page placement instant: the node already
 * exists, so placing/benching a block just moves it in the LiveProfileGrid — no round-trip. Rendered
 * UNSTYLED (styled=false); LiveProfileGrid applies each block's style frame client-side (instant style
 * edits). Fail-safe: each block sits in its own <Suspense fallback={null}> and renders nothing when empty.
 */
export function renderMemberBlockNodes(
  member: SpotlightData,
  layout: EntityLayout | null = null,
): Record<string, React.ReactNode> {
  const identity = toMemberEntity(member)
  const data = resolveMemberBlockData(member)
  const nodes: Record<string, React.ReactNode> = {}
  for (const id of Object.keys(MEMBER_PROFILE_BLOCKS)) {
    nodes[id] = renderMemberNode(transientNode(id, layout), identity, data, false)
  }
  return nodes
}

export function MemberProfileModules({
  member,
  layout,
  grid,
  editHref,
  density = 'roomy',
  className = `@container/profile ${stackClassFor(density)}`,
}: {
  /** The member's already-resolved Spotlight (from getPublishedSpotlight — the ONE reader). */
  member: SpotlightData
  /** Override the registry default order (e.g. a caller-supplied layout). Omitted = the fresh
   *  member default (defaultMemberLayout). Ignored when `grid` is supplied. */
  layout?: string[]
  /** The GRID layout (U2b/ADR-516) — an effective EntityLayout. When this prop is SUPPLIED (grid mode,
   *  even as `null`), the render goes through the freeform grid: resolveRows falls back to the default
   *  starter for a null/empty layout, so an un-customized member still shows a sensible default. Omit the
   *  prop entirely (undefined) to use the flat single-column `layout` path instead. */
  grid?: EntityLayout | null
  /** OWNER click-to-edit (Spaces item 6): given a block id, return the href of the member's existing
   *  layout editor. When set, each block is wrapped in an OwnerBlockFrame that overlays a hover pencil
   *  linking there. Omitted (every visitor / non-owner render) leaves the render byte-identical. */
  editHref?: (blockId: string) => string
  /** The surface's density (E3, density.ts). Defaults to `roomy`, the standalone Spotlight rhythm; the in-app
   *  profile asks for `compact`. Sets the flat-path stack unless `className` overrides it. */
  density?: BlockDensity
  /** The FLAT-path wrapper classes, overriding what `density` derives. Must keep
   *  `@container/profile` so blocks size to the column. Ignored on the grid path. */
  className?: string
}) {
  const identity = toMemberEntity(member)
  const data = resolveMemberBlockData(member)
  const gridLayout = grid ?? null

  const renderNode = (node: BlockNode) => {
    const rendered = renderMemberNode(node, identity, data, true)
    if (rendered === null) return null
    // OWNER wrap (fail-safe): with `editHref` set, sheathe the block in the click-to-edit frame, which
    // collapses itself on an honest-empty block so no phantom pencil floats over blank space. Absent
    // (visitor / non-owner), the block returns exactly as before. The `key` moves to the outermost node.
    // The frame and the editor href still address the block by TYPE: the rail builder is type-keyed
    // until task 12b hands it `selectedNid`.
    const id = node.type
    return editHref ? (
      <OwnerBlockFrame key={node.nid} blockId={id} editHref={editHref(id)} label={id}>
        {rendered}
      </OwnerBlockFrame>
    ) : (
      rendered
    )
  }

  // GRID path (ADR-516): resolve the effective rows AS NODES and render them. Entered whenever the caller
  // supplies the `grid` prop at all (including `null` — the resolver then yields the default starter). This
  // is the ONE in-app engine the owner preview and the visitor view share. Fail-safe: unknown types drop.
  if (grid !== undefined) {
    return (
      <div className="@container/profile">
        <EntityGrid rows={resolveNodeRowsFor(grid, 'member')} renderBlock={renderNode} />
      </div>
    )
  }

  // Flat single-column fallback (U2a). `@container/profile`: blocks size to THIS slot's width, not the
  // viewport, so the module render drops cleanly into any column.
  const resolved = layout ?? defaultMemberLayout()
  return <div className={className}>{resolved.map((id) => renderNode(transientNode(id, gridLayout)))}</div>
}
