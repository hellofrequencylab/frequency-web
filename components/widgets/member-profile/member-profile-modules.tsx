import { Suspense } from 'react'
import type { SpotlightData } from '@/lib/spotlight/data'
import { defaultMemberLayout } from '@/lib/entity-blocks/context'
import { layoutSlots, type EntityLayout } from '@/lib/entity-blocks/layout'
import { EntityGrid } from '@/components/entity-blocks/entity-grid'
import {
  resolveMemberBlockData,
  toMemberEntity,
  type MemberBlockProps,
} from '@/lib/entity-blocks/member-adapter'

import { AboutBlock } from './about'
import { StatsBlock } from './stats'
import { LinksBlock } from './links'
import { TopFriendsBlock } from './topfriends'
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
// STAFF/SELF-PREVIEW ONLY: nothing live reads this — the live Spotlight stays the Puck render
// (components/spotlight/puck-render.tsx). This validates the unified module render beside it.

type MemberBlockComponent = (props: MemberBlockProps) => React.ReactNode

/** The id -> block component map (parity with the U1 registry ids that support the member kind). Adding
 *  a member block is one row here + its block file. */
export const MEMBER_PROFILE_BLOCKS: Record<string, MemberBlockComponent> = {
  about: AboutBlock,
  stats: StatsBlock,
  links: LinksBlock,
  topfriends: TopFriendsBlock,
  heading: HeadingBlock,
  text: TextBlock,
  image: ImageBlock,
  gallery: GalleryBlock,
  quote: QuoteBlock,
  embed: EmbedBlock,
  divider: DividerBlock,
}

export function MemberProfileModules({
  member,
  layout,
  grid,
}: {
  /** The member's already-resolved Spotlight (from getPublishedSpotlight — the ONE reader). */
  member: SpotlightData
  /** Override the registry default order (e.g. a caller-supplied layout). Omitted = the fresh
   *  member default (defaultMemberLayout). Ignored when `grid` is supplied. */
  layout?: string[]
  /** The GRID layout (U2b) — an effective EntityLayout (from mergeEntityLayout). When present its
   *  template + slots drive the render; otherwise the flat single-column `layout` is used. */
  grid?: EntityLayout | null
}) {
  const identity = toMemberEntity(member)
  const data = resolveMemberBlockData(member)

  const renderBlock = (id: string) => {
    const Block = MEMBER_PROFILE_BLOCKS[id]
    if (!Block) return null
    return (
      <Suspense key={id} fallback={null}>
        <Block member={identity} data={data} />
      </Suspense>
    )
  }

  // GRID path: lay the visible per-slot blocks into the chosen template. Fail-safe: unknown ids drop.
  if (grid && grid.template) {
    return (
      <div className="@container/profile">
        <EntityGrid
          template={grid.template}
          slot={(slotId) => {
            const row = layoutSlots(grid).find((r) => r.slot === slotId)
            return row ? row.ids.map(renderBlock) : null
          }}
        />
      </div>
    )
  }

  // Flat single-column fallback (U2a). `@container/profile`: blocks size to THIS slot's width, not the
  // viewport, so the module render drops cleanly into any column.
  const resolved = layout ?? defaultMemberLayout()
  return <div className="@container/profile space-y-14">{resolved.map(renderBlock)}</div>
}
