import { BlockView } from '@/components/spotlight/blocks/render'
import { EMPTY_SPOTLIGHT_META } from '@/lib/spotlight/puck/metadata'
import type { MemberBlockProps } from '@/lib/entity-blocks/member-adapter'
import { MemberSection } from './section'

// LINKS — the member's bio-link list, flattened from every authored links block. Rendered through the
// existing Spotlight links renderer (a synthesised links block), so the button styling matches the live
// page. FAIL-SAFE: no links, no section.
export function LinksBlock({ data }: MemberBlockProps) {
  if (data.links.length === 0) return null
  return (
    <MemberSection anchor="links">
      <BlockView
        block={{ id: 'links', type: 'links', items: data.links }}
        stats={EMPTY_SPOTLIGHT_META.stats}
        topFriends={[]}
      />
    </MemberSection>
  )
}
