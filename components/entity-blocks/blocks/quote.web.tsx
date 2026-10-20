import { ContentBlockView } from '../content-block-view'

// THE QUOTE BLOCK'S ONE COMPONENT (lib/entity-blocks/contract/quote.ts): the renderer the profile and
// site already use, reached through the contract.
export default function QuoteBlock(props: Record<string, unknown>) {
  return <ContentBlockView id="quote" props={props} />
}
