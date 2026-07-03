import type { MemberBlockProps } from '@/lib/entity-blocks/member-adapter'
import { AuthoredBlockGroup } from './authored-group'

// GALLERY — every authored image grid, rendered through the shared Spotlight renderer (the lightbox
// lives in its own client wrapper). FAIL-SAFE: none authored, no section.
export function GalleryBlock({ data }: MemberBlockProps) {
  return <AuthoredBlockGroup blocks={data.blocksByType.gallery} anchor="gallery" />
}
