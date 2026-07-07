import type { SpaceContentData } from '@/lib/spaces/content-data'
import type { SpaceProfileContext } from '@/lib/spaces/profile-modules'
import { resolvePickedIds } from '@/lib/entity-blocks/block-content'
import { SpaceEventsBlock } from '@/components/page-editor/blocks/profile'
import { ModuleSection } from './section'

// EVENTS — the space's upcoming events (soonest first). Reads the live list off the data bag;
// FAIL-SAFE: no upcoming events, no section.
export function EventsBlock({
  data,
  header,
  featuredIds,
}: {
  space: SpaceProfileContext
  data: SpaceContentData
  header?: { eyebrow?: string; heading?: string }
  featuredIds?: string[]
}) {
  const all = data.events ?? []
  // The picker (ADR-572 item 5) features only the chosen events, in order; empty === show all (item 7).
  const picked = resolvePickedIds(featuredIds ?? [], all.map((e) => e.id))
  const byId = new Map(all.map((e) => [e.id, e]))
  const events = picked.map((id) => byId.get(id)).filter((e): e is (typeof all)[number] => Boolean(e))
  if (events.length === 0) return null
  return (
    <ModuleSection anchor="events">
      <SpaceEventsBlock eyebrow={header?.eyebrow ?? 'On the calendar'} heading={header?.heading ?? 'Upcoming events'} events={events} max={5} />
    </ModuleSection>
  )
}
