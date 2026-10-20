import { ContentBlockView } from '../content-block-view'

// THE LINKS BLOCK'S ONE COMPONENT (lib/entity-blocks/contract/links.ts): the renderer the profile and
// site already use, reached through the contract.
export default function LinksBlock(props: Record<string, unknown>) {
  return <ContentBlockView id="links" props={props} />
}
