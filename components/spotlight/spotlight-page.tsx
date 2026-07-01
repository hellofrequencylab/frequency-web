import type { SpotlightData } from '@/lib/spotlight/data'
import { SpotlightPuckRender } from './puck-render'

// The PUBLIC Spotlight route's page. A thin server wrapper over the Puck render bridge
// (components/spotlight/puck-render.tsx), which composes the identity header + theme with
// a Puck <Render> of the member's block body. The stored SpotlightLayout is bridged into a
// Puck document by the pure converter, so existing spotlights keep working with no migration.
export function SpotlightPage({ data }: { data: SpotlightData }) {
  // The public route opts into the join CTA (the viral loop).
  return <SpotlightPuckRender data={data} showJoinCta />
}
