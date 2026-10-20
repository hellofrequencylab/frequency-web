import { DesignBlockView } from '../design-block-view'

// THE ZIGZAG BLOCK'S ONE COMPONENT (lib/entity-blocks/contract/zigzag.ts): the renderer the Space page
// and the email preview already use, reached through the contract.
export default function ZigzagBlock(props: Record<string, unknown>) {
  return <DesignBlockView id="zigzag" props={props} />
}
