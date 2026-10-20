import { ContentBlockView } from '../content-block-view'

// THE IMAGE BLOCK'S ONE COMPONENT (lib/entity-blocks/contract/image.ts): the renderer the profile and
// site already use, reached through the contract.
export default function ImageBlock(props: Record<string, unknown>) {
  return <ContentBlockView id="image" props={props} />
}
