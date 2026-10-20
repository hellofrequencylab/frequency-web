import { ContentBlockView } from '../content-block-view'

// THE CONTACTFORM BLOCK'S ONE COMPONENT (lib/entity-blocks/contract/contactForm.ts): the renderer the profile and
// site already use, reached through the contract.
export default function ContactFormBlock(props: Record<string, unknown>) {
  return <ContentBlockView id="contactForm" props={props} />
}
