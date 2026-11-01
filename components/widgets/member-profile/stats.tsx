import { BlockView } from '@/components/spotlight/blocks/render'
import type { MemberBlockProps } from '@/lib/entity-blocks/member-adapter'
import { MemberSection } from './section'

// STATS — the member's headline gamification numbers (zaps / streak / gems / member-since / region).
// DATA block: the values are resolved SERVER-SIDE (never member-supplied); the bag only says WHICH keys
// to surface. Rendered through the existing Spotlight stats view. FAIL-SAFE: the view renders nothing
// when no chosen key has a value, and `empty:hidden` then collapses the section.
export function StatsBlock({ data }: MemberBlockProps) {
  return (
    <MemberSection anchor="stats">
      <BlockView
        block={{ id: 'stats', type: 'stats', show: data.statKeys }}
        stats={data.stats}
        topFriends={[]}
      />
    </MemberSection>
  )
}
