import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
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
    .in('scope_type', ['circle', 'group'])  // accept both during transition
    .eq('status', 'published')
    .eq('visibility', 'public')
    .eq('is_cancelled', false)
    .gte('starts_at', now)
    .order('starts_at', { ascending: true })
    .limit(3)

  const events = (raw ?? []) as WidgetEvent[]

  if (events.length === 0) return null

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-subtle">
          Upcoming
        </h2>
        <Link
          href="/events"
          className="text-xs text-primary-strong hover:text-primary-strong transition-colors"
        >
          See all →
        </Link>
      </div>

      <div className="mb-2">
        <UpcomingEventRows events={events} />
      </div>
    </section>
  )
}
