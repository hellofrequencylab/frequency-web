import { DesignBlockView } from '../design-block-view'

// THE CARDGRID BLOCK'S ONE COMPONENT (lib/entity-blocks/contract/cardGrid.ts): the renderer the Space page
// and the email preview already use, reached through the contract.
export default function CardGridBlock(props: Record<string, unknown>) {
  return <DesignBlockView id="cardGrid" props={props} />
}
