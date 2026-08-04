import type { SpaceContentData, SpaceEventItem } from '@/lib/spaces/content-data'
import type { SpaceProfileContext } from '@/lib/spaces/profile-modules'
import { gridColumns, resolvePickedIds, spaceEventsView } from '@/lib/entity-blocks/block-content'
import { formatEventWhen, eventInstant } from '@/lib/time/zone'
import { eventDayKey } from '@/lib/events/calendar-grid'
import { Eyebrow } from '@/components/page-editor/blocks/kit'
import { EventCard } from '@/components/events/event-card'
import type { EventRow } from '@/app/(main)/events/index-data'
import type { CalendarEvent } from '@/components/events/event-calendar'
import {
  EventPopupTrigger,
  SpaceEventsCalendarView,
  SpaceEventsList,
  SpaceEventsPopup,
  type SpaceEventsViewItem,
} from '@/components/spaces/space-events-popup'
import { ModuleSection } from './section'

// EVENTS — the space's upcoming events (soonest first), a FULL citizen of the space style system
// (Events block upgrade): the header composes the shared Eyebrow atom + the `font-display` face, so it
// re-skins with the Space's theme (ADR-578) and brand accent (AccentScope) like every other block, and
// the whole section carries only semantic tokens + the theme radius steps. Three operator-selectable
// views (the block's `view` setting; `list` is today's rows, so saved pages never shift):
//   list     — the date-square rows.
//   cards    — the events index card treatment (EventCard/EntityCard, composed not re-authored), with
//              a 2/3/4 `columns` setting that collapses to one column on mobile.
//   calendar — the shared month grid (Events EC2 EventCalendar), reused with clicks routed here.
// Clicking an event in ANY view opens the on-page popup (SpaceEventsPopup) with the real RSVP
// mechanics — never a navigation. FAIL-SAFE: no upcoming events, no section.

/** How many rows the list view shows (the block's long-standing cap) and how many cards the grid does. */
const LIST_MAX = 5
const CARDS_MAX = 12

/** The events index card needs an EventRow; build one honestly from the block item (real values where
 *  the space listing carries them, neutral ones where it does not — none of the neutral fields render:
 *  price/cover ride the card's own props, and a space listing has no circle/provenance context). */
function toEventRow(e: SpaceEventsViewItem): EventRow {
  return {
    id: e.id,
    title: e.title,
    slug: e.slug,
    location: e.location ?? null,
    starts_at: e.startsAt,
    ends_at: e.endsAt ?? null,
    is_cancelled: false,
    is_demo: e.isDemo === true,
    scope_id: '',
    scope_type: 'space',
    category: null,
    energy_tag: null,
    capacity: e.capacity ?? null,
    attendance_mode: null,
    price_cents: null,
    cover_image_path: null,
    host: null,
  }
}

/** The block header: the SAME atoms the design blocks compose (Eyebrow + a font-display heading), so
 *  the Space's theme fonts, brand accent, and the operator's TEXT STYLE / ALIGN settings all land here
 *  exactly as they do on sibling blocks (the eyebrow carries data-text-role, the heading is an h2). */
function EventsHeader({ eyebrow, heading }: { eyebrow?: string; heading?: string }) {
  if (!eyebrow && !heading) return null
  return (
    <div className="mb-6">
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      {heading && (
        <h2 className="font-display text-2xl uppercase tracking-tight text-balance text-text sm:text-3xl">
          {heading}
        </h2>
      )}
    </div>
  )
}

const COLUMN_CLASS: Record<2 | 3 | 4, string> = {
  2: 'grid grid-cols-1 gap-4 sm:grid-cols-2',
  3: 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3',
  4: 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4',
}

export function EventsBlock({
  data,
  header,
  featuredIds,
  content,
}: {
  space: SpaceProfileContext
  data: SpaceContentData
  header?: { eyebrow?: string; heading?: string }
  featuredIds?: string[]
  content?: Record<string, unknown>
}) {
  const all = data.events ?? []
  // The picker (ADR-573 item 5) features only the chosen events, in order; empty === show all (item 7).
  const picked = resolvePickedIds(featuredIds ?? [], all.map((e) => e.id))
  const byId = new Map(all.map((e) => [e.id, e]))
  const events = picked.map((id) => byId.get(id)).filter((e): e is SpaceEventItem => Boolean(e))
  if (events.length === 0) return null

  const view = spaceEventsView(content)
  const columns = gridColumns(content)

  // Pre-format every label SERVER-side (house style: the timezone lib never ships to the client) and
  // shape the one item list every view + the popup share.
  const items: SpaceEventsViewItem[] = events.map((e) => ({
    ...e,
    whenLabel: formatEventWhen(e.startsAt, e.timeZone ?? null, { style: 'full' }),
    timeLabel: formatEventWhen(e.startsAt, e.timeZone ?? null, { style: 'time', withZone: false }),
    dayKey: eventDayKey(e.startsAt),
    startInstantIso: eventInstant(e.startsAt, e.timeZone ?? null)?.toISOString() ?? null,
  }))

  const now = new Date()
  let body: React.ReactNode
  if (view === 'cards') {
    // The events index card treatment, composed whole (EventCard -> EntityCard); the trigger wrapper
    // turns the card's link click into the popup, keeping the card itself untouched.
    body = (
      <div className={COLUMN_CLASS[columns]}>
        {items.slice(0, CARDS_MAX).map((e) => (
          <EventPopupTrigger key={e.id} eventId={e.id}>
            <EventCard
              event={toEventRow(e)}
              coverUrl={e.coverUrl ?? undefined}
              coverFocus={e.coverFocus ?? null}
              going={e.going ?? 0}
              now={now}
              priceLabel={e.priceLabel ?? 'Free'}
            />
          </EventPopupTrigger>
        ))}
      </div>
    )
  } else if (view === 'calendar') {
    // The shared month grid (Events EC2), seeded to the current month; clicks open the popup.
    const calendarEvents: CalendarEvent[] = items
      .filter((e): e is SpaceEventsViewItem & { dayKey: string } => e.dayKey !== null)
      .map((e) => ({
        slug: e.slug,
        title: e.title,
        dayKey: e.dayKey,
        timeLabel: e.timeLabel,
        whenLabel: e.whenLabel,
        startInstantIso: e.startInstantIso,
        location: e.location ?? null,
        goingCount: e.going ?? 0,
        coverUrl: e.coverUrl ?? null,
        coverFocus: e.coverFocus ?? null,
        isCancelled: false,
      }))
    const idBySlug: Record<string, string> = {}
    for (const e of items) idBySlug[e.slug] = e.id
    body = (
      <SpaceEventsCalendarView
        events={calendarEvents}
        idBySlug={idBySlug}
        initialYear={now.getUTCFullYear()}
        initialMonth1={now.getUTCMonth() + 1}
      />
    )
  } else {
    // list — today's rows, restyled on the theme radius tokens, inside the block's own card (data
    // blocks self-card; the Background toggle strips it via the entity-bg-strip contract).
    body = (
      <div className="rounded-card border border-border bg-surface p-6 lift-1 sm:p-8">
        <SpaceEventsList items={items.slice(0, LIST_MAX)} />
      </div>
    )
  }

  return (
    <ModuleSection anchor="events">
      <SpaceEventsPopup items={items}>
        <EventsHeader eyebrow={header?.eyebrow ?? 'On the calendar'} heading={header?.heading ?? 'Upcoming events'} />
        {body}
      </SpaceEventsPopup>
    </ModuleSection>
  )
}
