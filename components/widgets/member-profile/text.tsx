import type { MemberBlockProps } from '@/lib/entity-blocks/member-adapter'
import { AuthoredBlockGroup } from './authored-group'

// TEXT — every authored paragraph the member wrote, rendered through the shared Spotlight renderer.
// FAIL-SAFE: none authored, no section.
export function TextBlock({ data }: MemberBlockProps) {
  return <AuthoredBlockGroup blocks={data.blocksByType.text} anchor="text" />
}
