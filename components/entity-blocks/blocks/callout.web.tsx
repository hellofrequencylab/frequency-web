import { ContentBlockView } from '../content-block-view'

// THE CALLOUT BLOCK'S ONE COMPONENT (lib/entity-blocks/contract/callout.ts): the renderer the profile and
// site already use, reached through the contract.
export default function CalloutBlock(props: Record<string, unknown>) {
  return <ContentBlockView id="callout" props={props} />
}
