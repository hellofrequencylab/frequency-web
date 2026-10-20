import { DesignBlockView } from '../design-block-view'

// THE EDITORIAL BLOCK'S ONE COMPONENT (lib/entity-blocks/contract/editorial.ts): the renderer the Space page
// and the email preview already use, reached through the contract.
export default function EditorialBlock(props: Record<string, unknown>) {
  return <DesignBlockView id="editorial" props={props} />
}
