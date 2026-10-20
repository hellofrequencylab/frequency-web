import { ContentBlockView } from '../content-block-view'

// THE EMBED BLOCK'S ONE COMPONENT (lib/entity-blocks/contract/embed.ts): the renderer the profile and
// site already use, reached through the contract.
export default function EmbedBlock(props: Record<string, unknown>) {
  return <ContentBlockView id="embed" props={props} />
}
