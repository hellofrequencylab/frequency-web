import { DesignBlockView } from '../design-block-view'

// THE PROSE BLOCK'S ONE COMPONENT (lib/entity-blocks/contract/prose.ts): the renderer the Space page
// and the email preview already use, reached through the contract.
export default function ProseBlock(props: Record<string, unknown>) {
  return <DesignBlockView id="prose" props={props} />
}
