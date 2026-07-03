import type { MemberBlockProps } from '@/lib/entity-blocks/member-adapter'
import { AuthoredBlockGroup } from './authored-group'

// IMAGE — every authored single image, rendered through the shared Spotlight renderer (which derives
// the public-bucket URL). FAIL-SAFE: none authored, no section.
export function ImageBlock({ data }: MemberBlockProps) {
  return <AuthoredBlockGroup blocks={data.blocksByType.image} anchor="image" />
}
