import Link from 'next/link'
import { CalendarDays } from 'lucide-react'
import { getActiveSpace } from '@/lib/spaces/active-space'
import { blueprintForType } from '@/lib/spaces/blueprints'
import { listEventsForSpace } from '@/lib/events/store'
import { ModuleCard } from '@/components/modules/module-card'
import { EntityCard } from '@/components/cards/entity-card'
import { EmptyState } from '@/components/ui/empty-state'
import { buttonClasses } from '@/components/ui/button'

// ENTITY MODULE — Action / Book (ENTITY-SPACES-BUILD §B.2, row `entity-booking`). A self-fetching
// RSC for the Practitioner blueprint's Book tab: reads the active Space, lists its OWN upcoming
// sessions, and presents the dynamic primary CTA (the blueprint's verb, e.g. "Book") beside the
// bookable times. The full availability/booking engine is a later phase (ENTITY-SPACES-SYSTEM
// §3.11 / Phase 4); until then the bookable unit IS the upcoming session, so "Book" routes a
// member to the session to RSVP. NULL only when there's no active Space.
//
// COPY: the CTA is a plain verb from the blueprint; the empty names the situation + next step; no
// em/en dashes, no narrated feelings.
export async function EntityCta() {
  const space = getActiveSpace()
  if (!space) return null
  const blueprint = blueprintForType(space.type)
  const ctaLabel = blueprint?.primaryCta.label ?? 'Book'

  const events = await listEventsForSpace(space.id, { upcomingOnly: true, limit: 8 })
  const live = events.filter((e) => !e.is_cancelled)

  return (
    <ModuleCard title={`${ctaLabel} a session`} tile>
      {live.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="No open times right now."
          description="Follow this space to hear the moment new sessions open."
        />
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted">Pick a time that works. You&apos;ll RSVP on the session page.</p>
          <div className="grid gap-4 @lg:grid-cols-2">
            {live.map((e) => {
              const start = new Date(e.starts_at)
              const when = `${start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} · ${start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
              return (
                <EntityCard
                  key={e.id}
                  href={`/events/${e.slug}`}
                  title={e.title}
                  meta={
                    <span className="inline-flex items-center gap-1">
                      <CalendarDays className="h-3.5 w-3.5" aria-hidden />
                      {when}
                    </span>
                  }
                  footer={
                    <Link href={`/events/${e.slug}`} className={buttonClasses('primary', 'sm', 'w-full justify-center')}>
                      {ctaLabel}
                    </Link>
                  }
                />
              )
            })}
          </div>
        </div>
      )}
    </ModuleCard>
  )
}
