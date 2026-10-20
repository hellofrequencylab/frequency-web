import { ContentBlockView } from '../content-block-view'

// THE BUTTON BLOCK'S ONE COMPONENT (lib/entity-blocks/contract/button.ts): the renderer the profile and
// site already use, reached through the contract.
export default function ButtonBlock(props: Record<string, unknown>) {
  return <ContentBlockView id="button" props={props} />
}
