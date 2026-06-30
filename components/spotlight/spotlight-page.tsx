import type { SpotlightData } from '@/lib/spotlight/data'
import { SpotlightView } from './spotlight-view'

// The PUBLIC Spotlight route's page. A thin server wrapper over the shared presentational
// SpotlightView (also used live in the editor preview, components/spotlight/builder.tsx),
// so the public page and the in-editor preview can never visually drift.
export function SpotlightPage({ data }: { data: SpotlightData }) {
  // The public route opts into the join CTA (the viral loop); the editor preview does not.
  return <SpotlightView data={data} showJoinCta />
}
