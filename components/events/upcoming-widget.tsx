import { createAdminClient } from '@/lib/supabase/admin'
import { SectionHeader } from '@/components/ui/section-header'
import { CIRCLE_SCOPE_TYPES } from '@/lib/events/circle-upcoming'
import { UpcomingEventRows, type UpcomingEventRow } from './upcoming-event-rows'

// The cross-scope "Upcoming" strip: the next few events across a SET of scopes (used by the
// Channel page for every Circle practicing that Channel). A single Circle's own block is the
// `circle-events` module (components/widgets/circles/circle-events.tsx), which adds the
// per-viewer visibility gate, the empty state, and the placement-aware read.
//
// Row markup lives in ./upcoming-event-rows so both surfaces render identical rows.

type WidgetEvent = UpcomingEventRow & { scope_id: string }

export async function UpcomingEventsWidget({
  scopeIds,
}: {
  scopeIds: string[]
}) {
  if (scopeIds.length === 0) return null

  const admin = createAdminClient()
  const now = new Date().toISOString()

  // PUBLIC EVENTS ONLY, and only published ones.
  //
  // This strip runs on the CHANNEL page, across every Circle practicing that Channel, and it reads
  // through the ADMIN client, which bypasses RLS. The viewer is not a member of those Circles and
  // may not be signed in at all, so the only safe set is what any visitor could already see.
  //
  // Without these two filters the query returned drafts and `circle_only` events. That was latent
  // rather than live only because circle placement was broken (it wrote a typed column no reader
  // consulted), so no upcoming event was ever circle-scoped and the strip always came back empty.
  // Fixing placement is what would have ARMED it: 18 published `circle_only` events exist right
  // now, and the first one placed into a Circle would have surfaced on a public Channel page.
  // `unlisted` and `private` are excluded by the same equality.
  //
  // A single Circle's own block (components/widgets/circles/circle-events.tsx) is the surface that
  // may widen this, because there the viewer's membership in THAT Circle is known.
  const { data: raw } = await admin
    .from('events')
    .select('id, title, slug, location, starts_at, scope_id')
    .in('scope_id', scopeIds)
    // The ONE list of scope_type values that mean "created for a Circle" ('group' is the
    // pre-rename value still in older rows) — shared with the Circle block and belonging.ts,
    // never a second hand-written copy.
    .in('scope_type', [...CIRCLE_SCOPE_TYPES])
    .eq('status', 'published')
    .eq('visibility', 'public')
    .eq('is_cancelled', false)
    // Staff removal (lib/events/event-drafts.ts removeEvent) also sets is_cancelled, so this is
    // belt-and-braces — but the Circle's own block filters it, and the two reads should agree.
    .is('removed_at', null)
    .gte('starts_at', now)
    .order('starts_at', { ascending: true })
    .limit(3)

  const events = (raw ?? []) as WidgetEvent[]

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
