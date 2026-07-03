import { BlockView } from '@/components/spotlight/blocks/render'
import { EMPTY_SPOTLIGHT_META } from '@/lib/spotlight/puck/metadata'
import type { SpotlightBlock } from '@/lib/spotlight/blocks/schema'
import { MemberSection } from './section'

// Shared render for an AUTHORED content block type (heading/text/image/gallery/quote/embed/divider).
// The unified registry keys blocks by TYPE, so a member's many authored instances of one type render
// together here, each through the EXISTING Spotlight <BlockView> (the closed-allowlist server renderer
// in components/spotlight/blocks/render.tsx) — no block UI is re-implemented. FAIL-SAFE: an empty slice
// renders nothing (no section, no gap). Stats/topFriends context is empty here because these authored
// types never read it; the data blocks pass their own.

export function AuthoredBlockGroup({ blocks, anchor }: { blocks: SpotlightBlock[]; anchor: string }) {
  if (blocks.length === 0) return null
  return (
    <MemberSection anchor={anchor}>
      <div className="space-y-4">
        {blocks.map((block) => (
          <BlockView key={block.id} block={block} stats={EMPTY_SPOTLIGHT_META.stats} topFriends={[]} />
        ))}
      </div>
    </MemberSection>
  )
}
