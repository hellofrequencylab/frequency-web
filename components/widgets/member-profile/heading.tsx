import type { MemberBlockProps } from '@/lib/entity-blocks/member-adapter'
import { AuthoredBlockGroup } from './authored-group'

// HEADING — every authored heading the member wrote, rendered through the shared Spotlight renderer.
// FAIL-SAFE: none authored, no section.
export function HeadingBlock({ data }: MemberBlockProps) {
  return <AuthoredBlockGroup blocks={data.blocksByType.heading} anchor="heading" />
}
