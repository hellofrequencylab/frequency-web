import Link from 'next/link'
import { Suspense } from 'react'
import { CalendarDays } from 'lucide-react'
import { getActiveSpace } from '@/lib/spaces/active-space'
import { blueprintForType } from '@/lib/spaces/blueprints'
import { listEventsForSpace } from '@/lib/events/store'
import { ModuleCard } from '@/components/modules/module-card'
import { EntityCard } from '@/components/cards/entity-card'
import { EmptyState } from '@/components/ui/empty-state'
import { buttonClasses } from '@/components/ui/button'
import { BookingMember } from '@/components/spaces/booking-member'
import { MembershipJoin } from '@/components/spaces/membership-join'

// ENTITY MODULE - Action / Book (ENTITY-SPACES-BUILD section B.2, row `entity-booking`). A
// self-fetching RSC for a blueprint's action tab. It reads the active Space and branches by role:
//
//   PRACTITIONER ("Book"-type CTA): renders the real 1:1 BOOKING surface (ENTITY-SPACES-SYSTEM
//   section 2.4, booking v1). The member sees the next ~14 days of open slots (in the Space's
//   timezone, labeled), picks one, and confirms. The slot fetch sits behind <Suspense> so the tab
//   paints instantly (PAGE-FRAMEWORK section 5).
//
//   BUSINESS ("Join"-type CTA): renders the real MEMBERSHIP surface (ENTITY-SPACES-SYSTEM section
//   2.5, memberships v1). The member sees the Space's active tiers (name / price / benefits) and
//   joins one, or, if already a member, sees their tier + a Cancel. v1 takes NO payment: joining
//   registers the member, and the copy says so plainly (CONTENT-VOICE skeptic test). The tier fetch
//   sits behind <Suspense> so the tab paints instantly (PAGE-FRAMEWORK section 5).
//
//   OTHER ROLES (Organization "Donate", Coaching "Enroll", Event Space "Get tickets"): the deep
//   conversion engines are a LATER phase, so these keep the current PLACEHOLDER - the Space's own
//   upcoming sessions, each routing to the session page to RSVP. Out of scope here.
//
// NULL only when there is no active Space.
//
// COPY: the CTA is a plain verb from the blueprint; the empty names the situation + next step; no
// em/en dashes, no narrated feelings (CONTENT-VOICE section 10).
export async function EntityCta() {
  const space = getActiveSpace()
  if (!space) return null
  const blueprint = blueprintForType(space.type)
  const ctaLabel = blueprint?.primaryCta.label ?? 'Book'

  // Practitioner is the role whose deep feature is real 1:1 booking (the "Book" CTA). Render the
  // live booking surface for it; every other role keeps the placeholder session list below.
  if (space.type === 'practitioner') {
    return (
      <ModuleCard title="Book a session" tile>
        <Suspense fallback={<BookingSkeleton />}>
          <BookingMember spaceId={space.id} />
        </Suspense>
      </ModuleCard>
    )
  }

  // Business is the role whose deep feature is memberships (the "Join" CTA). Render the live
  // membership/join surface for it; every other role keeps the placeholder session list below.
  if (space.type === 'business') {
    return (
      <ModuleCard title="Become a member" tile>
        <Suspense fallback={<MembershipSkeleton />}>
          <MembershipJoin spaceId={space.id} />
        </Suspense>
      </ModuleCard>
    )
  }

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

// Dimension-matched skeleton for the streamed tier fetch (no CLS, PAGE-FRAMEWORK section 5.4).
function MembershipSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-4 w-64 animate-pulse rounded bg-surface-elevated/60" />
      <div className="grid gap-4 @lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="h-44 animate-pulse rounded-2xl bg-surface-elevated/60" />
        ))}
      </div>
    </div>
  )
}

// Dimension-matched skeleton for the streamed slot fetch (no CLS, PAGE-FRAMEWORK section 5.4).
function BookingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-4 w-56 animate-pulse rounded bg-surface-elevated/60" />
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="space-y-2">
          <div className="h-4 w-40 animate-pulse rounded bg-surface-elevated/60" />
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 5 }).map((_, j) => (
              <div key={j} className="h-8 w-16 animate-pulse rounded-lg bg-surface-elevated/60" />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
