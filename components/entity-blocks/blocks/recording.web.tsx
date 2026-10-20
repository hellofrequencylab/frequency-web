import { ContentBlockView } from '../content-block-view'

// THE RECORDING BLOCK'S ONE COMPONENT (lib/entity-blocks/contract/recording.ts): the renderer the profile and
// site already use, reached through the contract.
export default function RecordingBlock(props: Record<string, unknown>) {
  return <ContentBlockView id="recording" props={props} />
}
