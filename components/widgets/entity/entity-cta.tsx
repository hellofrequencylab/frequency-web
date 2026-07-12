import { Suspense } from 'react'
import { CalendarDays } from 'lucide-react'
import { getActiveSpace } from '@/lib/spaces/active-space'
import { defaultPrimaryCtaLabel } from '@/lib/spaces/profile-config'
import { resolveMode, type ModeVariant } from '@/lib/spaces/modes'
import { viewerManagesSpace } from '@/lib/spaces/operator'
import { listEventsForSpace } from '@/lib/events/store'
import { ModuleCard } from '@/components/modules/module-card'
import { EntityCard } from '@/components/cards/entity-card'
import { EmptyState } from '@/components/ui/empty-state'
import { AdminSetupPrompt } from '@/components/spaces/admin-setup-prompt'
import { BookingMember } from '@/components/spaces/booking-member'
import { MembershipJoin } from '@/components/spaces/membership-join'
import { DonateMember } from '@/components/spaces/donations/donate-member'
import { EnrollMember } from '@/components/spaces/enroll/enroll-member'
import { TicketsMember } from '@/components/spaces/tickets/tickets-member'
import { EntityCtaLink } from '@/components/widgets/entity/entity-cta-link'

// ENTITY MODULE - Action / Book (ENTITY-SPACES-BUILD section B.2, row `entity-booking`). A
// self-fetching RSC for a Space's action tab. After the ADR-552 type collapse the transactional widget
// is chosen by the Space's resolved FOCUS (mode_variant, via lib/spaces/modes.ts resolveMode), NOT by
// its type: a Business with the "appointments" Focus still books, one with "ticketed" still sells
// tickets, and a Nonprofit with "donations" still takes donations. Focus is FREE framing (never a
// gate), so this only picks which deep surface leads; every surface stays reachable:
//
//   BOOKING (appointments Focus): the real 1:1 BOOKING surface (ENTITY-SPACES-SYSTEM 2.4, booking v1).
//   The member sees the next ~14 days of open slots (in the Space's timezone, labeled), picks one, and
//   confirms.
//
//   MEMBERSHIP (service / product / membership Focus): the real MEMBERSHIP surface (ENTITY-SPACES-SYSTEM
//   2.5). The member sees the active tiers (name / price / benefits) and joins one, or sees their tier +
//   a Cancel. v1 takes NO payment: joining registers the member, and the copy says so plainly.
//
//   DONATE (donations Focus): the real DONATE surface (MASTER-PLAN ADMIN-04). The member sees the fund
//   label, description, and suggested amounts. v1 takes NO money; the copy says so plainly. DonateMember
//   fires the `space.cta_click` event on mount.
//
//   ENROLL (packages / cohort / programs Focus): the real ENROLL surface (MASTER-PLAN ADMIN-04). The
//   member sees the program details + seats left and enrolls (or sees their status + a Cancel). v1 takes
//   NO payment: enrolling reserves a seat.
//
//   TICKETS (ticketed Focus): the real TICKETS surface (MASTER-PLAN ADMIN-04). The member sees the free /
//   RSVP tiers and reserves a spot (or sees their spot + a Cancel). v1 takes NO money.
//
//   Each deep surface fetch sits behind <Suspense> so the tab paints instantly (PAGE-FRAMEWORK §5), and
//   each fires a `space.cta_click` event (Epic 1.11) on the member's primary interaction.
//
//   NO FOCUS (the platform host `root`, whose type resolves to no Mode): falls through to the Space's own
//   upcoming sessions, each routing to the session page to RSVP. The primary CTA there records a
//   `space.cta_click` event (Epic 1.11) via EntityCtaLink.
//
// NULL only when there is no active Space.
//
// COPY: the CTA is the per-type default primary-CTA label (profile-config, operator-overridable); the
// empty names the situation + next step; no em/en dashes, no narrated feelings (CONTENT-VOICE §10).

// The transactional widget a Focus (mode_variant) leads with. Keyed by the resolved Focus so every
// widget path stays reachable regardless of the (now two-value) Space type. A Focus not listed
// (or a Space with no Mode) falls through to the upcoming-sessions list below.
type CtaKind = 'booking' | 'membership' | 'donate' | 'enroll' | 'tickets'
const CTA_KIND_BY_VARIANT: Partial<Record<ModeVariant, CtaKind>> = {
  appointments: 'booking',
  service: 'membership',
  product: 'membership',
  membership: 'membership',
  packages: 'enroll',
  cohort: 'enroll',
  programs: 'enroll',
  donations: 'donate',
  ticketed: 'tickets',
}

export async function EntityCta() {
  const space = getActiveSpace()
  if (!space) return null
  const ctaLabel = defaultPrimaryCtaLabel(space.type)

  // Pick the transactional widget from the resolved FOCUS (mode_variant), not the type. A null Mode
  // (the `root` host) has no Focus, so it falls through to the sessions list below.
  const mode = resolveMode(space.type, space.modeVariant)
  const ctaKind = mode ? CTA_KIND_BY_VARIANT[mode.variant] : undefined

  // The appointments Focus leads with real 1:1 booking (the "Book" CTA).
  if (ctaKind === 'booking') {
    return (
      <ModuleCard title="Book a session" tile>
        <Suspense fallback={<BookingSkeleton />}>
          <BookingMember spaceId={space.id} slug={space.slug} ownerProfileId={space.ownerProfileId} />
        </Suspense>
      </ModuleCard>
    )
  }

  // The service / product / membership Focuses lead with memberships (the "Join" CTA).
  if (ctaKind === 'membership') {
    return (
      <ModuleCard title="Become a member" tile>
        <Suspense fallback={<MembershipSkeleton />}>
          <MembershipJoin spaceId={space.id} slug={space.slug} ownerProfileId={space.ownerProfileId} />
        </Suspense>
      </ModuleCard>
    )
  }

  // The donations Focus leads with the Donate surface (owner-configured ask). v1 takes no money.
  if (ctaKind === 'donate') {
    return (
      <ModuleCard title={ctaLabel} tile>
        <Suspense fallback={<MembershipSkeleton />}>
          <DonateMember spaceId={space.id} slug={space.slug} ownerProfileId={space.ownerProfileId} />
        </Suspense>
      </ModuleCard>
    )
  }

  // The packages / cohort / programs Focuses lead with enrollment (the "Enroll" CTA). v1 reserves a seat.
  if (ctaKind === 'enroll') {
    return (
      <ModuleCard title="Enroll in the program" tile>
        <Suspense fallback={<MembershipSkeleton />}>
          <EnrollMember spaceId={space.id} slug={space.slug} ownerProfileId={space.ownerProfileId} />
        </Suspense>
      </ModuleCard>
    )
  }

  // The ticketed Focus leads with the Tickets surface (owner tiers, free / RSVP). v1 records a spot.
  if (ctaKind === 'tickets') {
    return (
      <ModuleCard title="Get tickets" tile>
        <Suspense fallback={<MembershipSkeleton />}>
          <TicketsMember spaceId={space.id} slug={space.slug} ownerProfileId={space.ownerProfileId} />
        </Suspense>
      </ModuleCard>
    )
  }

  const events = await listEventsForSpace(space.id, { upcomingOnly: true, limit: 8 })
  const live = events.filter((e) => !e.is_cancelled)
  // Only resolve operator status on the EMPTY path (the rare owner-setup moment), so the happy path
  // (live sessions) never pays for the lookup.
  const canManage = live.length === 0 && (await viewerManagesSpace(space))

  return (
    <ModuleCard title={`${ctaLabel} a session`} tile>
      {live.length === 0 ? (
        canManage ? (
          // OPERATOR (owner / admin / editor): nothing is scheduled and this space leads with a plain
          // sessions list (no Focus surface), so point them at the console to set up what their button does.
          <AdminSetupPrompt
            icon={CalendarDays}
            title="Your button opens sessions, but none are scheduled."
            description="Set up what your button opens for your space."
            links={[{ href: `/spaces/${space.slug}/manage`, label: 'Open your console' }]}
          />
        ) : (
          <EmptyState
            icon={CalendarDays}
            title="No open times right now."
            description="Follow this space to hear the moment new sessions open."
          />
        )
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
                    // The primary CTA. A click fires a `space.cta_click` event (Epic 1.11) fire-and-forget
                    // before navigating to the session page; the wrapper never blocks or fails navigation.
                    <EntityCtaLink spaceId={space.id} href={`/events/${e.slug}`} label={ctaLabel} />
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
