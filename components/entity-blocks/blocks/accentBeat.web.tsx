import { DesignBlockView } from '../design-block-view'

// THE ACCENTBEAT BLOCK'S ONE COMPONENT (lib/entity-blocks/contract/accentBeat.ts): the renderer the Space page
// and the email preview already use, reached through the contract.
export default function AccentBeatBlock(props: Record<string, unknown>) {
  return <DesignBlockView id="accentBeat" props={props} />
}
