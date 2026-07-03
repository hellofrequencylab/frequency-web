import type { MemberBlockProps } from '@/lib/entity-blocks/member-adapter'
import { AuthoredBlockGroup } from './authored-group'

// EMBED — every authored first-party embed, rendered through the shared Spotlight renderer (which
// rebuilds the iframe src from the validated provider + ref). FAIL-SAFE: none authored, no section.
export function EmbedBlock({ data }: MemberBlockProps) {
  return <AuthoredBlockGroup blocks={data.blocksByType.embed} anchor="embed" />
}
