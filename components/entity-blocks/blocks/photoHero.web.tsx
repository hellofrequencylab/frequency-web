import { DesignBlockView } from '../design-block-view'

// THE PHOTOHERO BLOCK'S ONE COMPONENT (lib/entity-blocks/contract/photoHero.ts): the renderer the Space page
// and the email preview already use, reached through the contract.
export default function PhotoHeroBlock(props: Record<string, unknown>) {
  return <DesignBlockView id="photoHero" props={props} />
}
