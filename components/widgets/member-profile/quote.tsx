import type { MemberBlockProps } from '@/lib/entity-blocks/member-adapter'
import { AuthoredBlockGroup } from './authored-group'

// QUOTE — every authored pull quote, rendered through the shared Spotlight renderer.
// FAIL-SAFE: none authored, no section.
export function QuoteBlock({ data }: MemberBlockProps) {
  return <AuthoredBlockGroup blocks={data.blocksByType.quote} anchor="quote" />
}
