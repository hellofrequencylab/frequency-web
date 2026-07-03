import type { MemberBlockProps } from '@/lib/entity-blocks/member-adapter'
import { AuthoredBlockGroup } from './authored-group'

// DIVIDER — every authored visual break, rendered through the shared Spotlight renderer.
// FAIL-SAFE: none authored, no section.
export function DividerBlock({ data }: MemberBlockProps) {
  return <AuthoredBlockGroup blocks={data.blocksByType.divider} anchor="divider" />
}
