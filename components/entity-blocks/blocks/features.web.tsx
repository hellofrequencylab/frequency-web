import { ContentBlockView } from '../content-block-view'

// THE FEATURES BLOCK'S ONE COMPONENT (lib/entity-blocks/contract/features.ts): the renderer the profile and
// site already use, reached through the contract.
export default function FeaturesBlock(props: Record<string, unknown>) {
  return <ContentBlockView id="features" props={props} />
}
