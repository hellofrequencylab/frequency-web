import { ContentBlockView } from '../content-block-view'

// THE TEXT BLOCK'S ONE COMPONENT (lib/entity-blocks/contract/text.ts): the renderer the profile and
// site already use, reached through the contract.
export default function TextBlock(props: Record<string, unknown>) {
  return <ContentBlockView id="text" props={props} />
}
