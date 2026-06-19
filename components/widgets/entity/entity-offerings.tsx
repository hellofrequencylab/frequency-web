import { CalendarDays } from 'lucide-react'
import { getActiveSpace } from '@/lib/spaces/active-space'
import { listEventsForSpace } from '@/lib/events/store'
import { SectionHeader } from '@/components/ui/section-header'
import { EntityCard } from '@/components/cards/entity-card'
import { EmptyState } from '@/components/ui/empty-state'

// ENTITY MODULE — Offerings (ENTITY-SPACES-BUILD §B.2, row `entity-offerings`). A self-fetching
// RSC: reads the active Space, lists its OWN upcoming events (listEventsForSpace is space_id-
// filtered + fail-safe), and renders them as an `EntityCard` grid under a `SectionHeader`. Empty →
// `EmptyState` (variant first-use). NULL only when there's no active Space.
//
// COPY (CONTENT-VOICE §10): "Upcoming sessions" is plain; the empty line names the situation and
// the next step without narrating feelings; no em/en dashes.

const DATE_FMT: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric' }
const TIME_FMT: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' }

export async function EntityOfferings() {
  const space = getActiveSpace()
  if (!space) return null

  const events = await listEventsForSpace(space.id, { upcomingOnly: true, limit: 6 })
  const live = events.filter((e) => !e.is_cancelled)

  return (
    <div>
      <SectionHeader title="Upcoming sessions" count={live.length || undefined} />
      {live.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="Nothing on the calendar yet."
          description="New sessions show up here the moment they're scheduled."
        />
      ) : (
        <div className="grid gap-4 @lg:grid-cols-2">
          {live.map((e) => {
            const start = new Date(e.starts_at)
            const when = `${start.toLocaleDateString('en-US', DATE_FMT)} · ${start.toLocaleTimeString('en-US', TIME_FMT)}`
            return (
              <EntityCard
                key={e.id}
                href={`/events/${e.slug}`}
                title={e.title}
                description={e.description ?? undefined}
                meta={
                  <span className="inline-flex items-center gap-1">
                    <CalendarDays className="h-3.5 w-3.5" aria-hidden />
                    {when}
                  </span>
                }
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
