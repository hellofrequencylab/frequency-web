import type { SpaceContentData } from '@/lib/spaces/content-data'
import type { SpaceProfileContext } from '@/lib/spaces/profile-modules'
import { SpaceEventsBlock } from '@/components/page-editor/blocks/profile'
import { ModuleSection } from './section'

// EVENTS — the space's upcoming events (soonest first). Reads the live list off the data bag;
// FAIL-SAFE: no upcoming events, no section.
export function EventsBlock({ data }: { space: SpaceProfileContext; data: SpaceContentData }) {
  const events = data.events ?? []
  if (events.length === 0) return null
  return (
    <ModuleSection anchor="events">
      <SpaceEventsBlock eyebrow="On the calendar" heading="Upcoming events" events={events} max={5} />
    </ModuleSection>
  )
}
