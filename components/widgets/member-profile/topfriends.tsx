import { BlockView } from '@/components/spotlight/blocks/render'
import { EMPTY_SPOTLIGHT_META } from '@/lib/spotlight/puck/metadata'
import type { MemberBlockProps } from '@/lib/entity-blocks/member-adapter'
import { MemberSection } from './section'

// TOP FRIENDS — the member's "Top 8" grid. DATA block: the faces are resolved SERVER-SIDE from the
// spotlight_top_friends table (never member-supplied); the bag carries only the optional grid heading.
// Rendered through the existing Spotlight Top Friends view. FAIL-SAFE: the view renders nothing when
// nobody is featured, and `empty:hidden` collapses the section.
export function TopFriendsBlock({ data }: MemberBlockProps) {
  return (
    <MemberSection anchor="topfriends">
      <BlockView
        block={{ id: 'topfriends', type: 'topfriends', title: data.topFriendsTitle }}
        stats={EMPTY_SPOTLIGHT_META.stats}
        topFriends={data.topFriends}
      />
    </MemberSection>
  )
}
