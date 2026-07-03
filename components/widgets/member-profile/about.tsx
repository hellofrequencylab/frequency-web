import { BlockView } from '@/components/spotlight/blocks/render'
import { EMPTY_SPOTLIGHT_META } from '@/lib/spotlight/puck/metadata'
import type { MemberBlockProps } from '@/lib/entity-blocks/member-adapter'
import { MemberSection } from './section'

// ABOUT — the member's story (their bio). DATA block: reads the About body off the bag and renders it
// through the existing Spotlight text renderer (a synthesised text block), so type/spacing match the
// live page. FAIL-SAFE: no bio, no section.
export function AboutBlock({ data }: MemberBlockProps) {
  if (!data.about) return null
  return (
    <MemberSection anchor="about">
      <BlockView
        block={{ id: 'about', type: 'text', text: data.about }}
        stats={EMPTY_SPOTLIGHT_META.stats}
        topFriends={[]}
      />
    </MemberSection>
  )
}
