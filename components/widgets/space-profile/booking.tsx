import type { SpaceContentData } from '@/lib/spaces/content-data'
import type { SpaceProfileContext } from '@/lib/spaces/profile-modules'
import { SpaceBookingBlock } from '@/components/page-editor/blocks/profile'
import { ModuleSection } from './section'

// BOOKING — the booking entry card. Reads the space's live booking capability off the data bag;
// FAIL-SAFE: when the space publishes no availability the reused block renders nothing (never an
// empty promise).
export function BookingBlock({
  data,
  header,
}: {
  space: SpaceProfileContext
  data: SpaceContentData
  header?: { eyebrow?: string; heading?: string }
}) {
  return (
    <ModuleSection anchor="booking">
      <SpaceBookingBlock
        heading={header?.heading ?? 'Book a session'}
        body="Pick a time that works and reserve your spot."
        booking={data.booking}
        accent
      />
    </ModuleSection>
  )
}
