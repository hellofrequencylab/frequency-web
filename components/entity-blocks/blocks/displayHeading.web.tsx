import { DesignBlockView } from '../design-block-view'

// THE DISPLAYHEADING BLOCK'S ONE COMPONENT (lib/entity-blocks/contract/displayHeading.ts): the renderer the Space page
// and the email preview already use, reached through the contract.
export default function DisplayHeadingBlock(props: Record<string, unknown>) {
  return <DesignBlockView id="displayHeading" props={props} />
}
