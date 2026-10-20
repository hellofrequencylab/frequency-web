import { ContentBlockView } from '../content-block-view'

// THE GALLERY BLOCK'S ONE COMPONENT (lib/entity-blocks/contract/gallery.ts): the renderer the profile and
// site already use, reached through the contract.
export default function GalleryBlock(props: Record<string, unknown>) {
  return <ContentBlockView id="gallery" props={props} />
}
