import { SectionHeader } from '@/components/ui/section-header'
import { CIRCLE_SCOPE_TYPES } from '@/lib/events/circle-upcoming'
import { readUpcomingSeries } from '@/lib/events/upcoming-series'
import { HOME_TZ, dayInZone } from '@/lib/time/zone'
import {
  SERIES_COLUMNS,
  TEASER_CARDS_PER_SERIES,
  collapseSeriesRows,
  seriesUpcomingFloor,
  type SeriesFields,
} from '@/lib/events/series'
import { UpcomingEventRows, type UpcomingEventRow } from './upcoming-event-rows'

// The cross-scope "Upcoming" strip: the next few events across a SET of scopes (used by the
// Channel page for every Circle practicing that Channel). A single Circle's own block is the
// `circle-events` module (components/widgets/circles/circle-events.tsx), which adds the
// per-viewer visibility gate, the empty state, and the placement-aware read.
//
// Row markup lives in ./upcoming-event-rows so both surfaces render identical rows.

type WidgetEvent = UpcomingEventRow & SeriesFields & { scope_id: string }

/** Rows the strip shows. Three, and a repeating series may only have ONE of them. */
const STRIP_SLOTS = 3

export async function UpcomingEventsWidget({
  scopeIds,
}: {
  scopeIds: string[]
}) {
  if (scopeIds.length === 0) return null

  // Midnight today in the community's zone, not `new Date()`: starts_at is the host's wall clock
  // kept as UTC parts, so a raw ISO instant drops tonight's gathering from 5pm Pacific onward.
  // The same string is the query floor and the fold floor.
  const floor = seriesUpcomingFloor(dayInZone(new Date(), HOME_TZ))

  // PUBLIC EVENTS ONLY, and only published ones.
  //
  // This strip runs on the CHANNEL page, across every Circle practicing that Channel, and it reads
  // through the ADMIN client, which bypasses RLS. The viewer is not a member of those Circles and
  // may not be signed in at all, so the only safe set is what any visitor could already see.
  //
  // Without the published and public gate the query returned drafts and `circle_only` events. That was latent
  // rather than live only because circle placement was broken (it wrote a typed column no reader
  // consulted), so no upcoming event was ever circle-scoped and the strip always came back empty.
  // Fixing placement is what would have ARMED it: 18 published `circle_only` events exist right
  // now, and the first one placed into a Circle would have surfaced on a public Channel page.
  // `unlisted` and `private` are excluded by the same equality.
  //
  // A single Circle's own block (components/widgets/circles/circle-events.tsx) is the surface that
  // may widen this, because there the viewer's membership in THAT Circle is known.
  //
  // One row per series, counted in SQL (LIVE-731): the function applies the same gate the
  // read above describes (published, live, public, in these Circles, from the floor).
  const raw = await readUpcomingSeries<WidgetEvent>({
    from: floor,
    limit: STRIP_SLOTS,
    visibilities: ['public'],
    scopeIds,
    // The ONE list of scope_type values that mean "created for a Circle" ('group' is the
    // pre-rename value still in older rows), shared with the Circle block and belonging.ts.
    scopeTypes: CIRCLE_SCOPE_TYPES,
    // The three recurrence columns are what make the fold below anything other than a no-op.
    columns: `id, title, slug, location, starts_at, scope_id, ${SERIES_COLUMNS}`,
  })

  // A repeating event takes one slot here and shows its next date. The other dates live on the
  // event page's date rail, so nothing becomes unreachable (ADR-897).
  const events = collapseSeriesRows(raw, {
    upcomingFrom: floor,
    perSeries: TEASER_CARDS_PER_SERIES,
  }).slice(0, STRIP_SLOTS)

  if (events.length === 0) return null

  return (
    <section>
      {/* The house module heading (SectionHeader exists to replace the ad-hoc uppercase
          section labels), with the title itself as the drill-down into /events — the same
          grammar as the rail's Circles module beside it. */}
      <SectionHeader title="Upcoming" href="/events" />
      <UpcomingEventRows events={events} />
    </section>
  )
}
