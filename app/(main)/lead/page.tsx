import Link from 'next/link'
import { Users, CalendarDays, MapPin } from 'lucide-react'
import { requireLeadFloor } from '@/lib/admin/guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { DashboardTemplate } from '@/components/templates'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'
import { EntityCard } from '@/components/cards/entity-card'
import { formatEventDate } from '@/lib/utils'
import { getEventsAdminData } from '@/app/(main)/admin/events/load-events'
import { getLedCircles } from './load-led-circles'

// The Leader dashboard (/lead): a CONSOLIDATED, read-mostly home for community
// leaders (host/guide/mentor) after /admin became staff-only. It does NOT duplicate
// the per-circle settings modules — leaders still manage each circle from its own
// page (the Settings control / PageAdminBar). This surface just gathers "what you
// lead" and links into those existing controls.
//
// SCOPING (security): every read is keyed to the caller's own profile.
//   • getLedCircles(role, profileId) mirrors the /admin/circles per-role scoping
//     (host_id = me / hubs I guide / nexuses I mentor) — never an "all circles" read.
//   • getEventsAdminData(profileId) is the existing loader already scoped to the
//     host's circles + events they host directly.
//   • the per-circle upcoming-event counts query is filtered to the led circle ids.
// There is no platform-wide query on this page.

export const metadata = {
  title: 'Lead',
  description: 'The circles you lead, and what is coming up across them.',
}

export default async function LeadPage() {
  const { profileId, role } = await requireLeadFloor()

  const [circles, eventsData] = await Promise.all([
    getLedCircles(role, profileId),
    getEventsAdminData(profileId),
  ])
  const upcoming = eventsData.upcoming

  // Quiet per-circle upcoming-event counts, scoped to the circles this leader leads
  // (no platform-wide read: the `.in('scope_id', circleIds)` is the only filter and
  // circleIds came from getLedCircles, which is keyed to profileId).
  const circleIds = circles.map((c) => c.id)
  const upcomingByCircle = new Map<string, number>()
  if (circleIds.length > 0) {
    const { data: upcomingRows } = await createAdminClient()
      .from('events')
      .select('scope_id')
      .in('scope_id', circleIds)
      .eq('is_cancelled', false)
      .gte('starts_at', new Date().toISOString())
    for (const row of (upcomingRows ?? []) as { scope_id: string | null }[]) {
      if (row.scope_id) upcomingByCircle.set(row.scope_id, (upcomingByCircle.get(row.scope_id) ?? 0) + 1)
    }
  }

  const leadsNothing = circles.length === 0

  return (
    <DashboardTemplate
      eyebrow="Lead"
      title="The circles you lead"
      description="A quick read on what you steward. Open a circle to manage it, post, or run an event."
      width="default"
    >
      <section>
        <SectionHeader title="Circles you lead" count={circles.length} />
        {leadsNothing ? (
          <EmptyState
            title="You are not leading a circle yet"
            description="Leading a circle gives you a home base: a place to gather members, post updates, and run events. When you host or guide one, it shows up here with its members and what is coming up."
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {circles.map((c) => {
              const upcomingCount = upcomingByCircle.get(c.id) ?? 0
              return (
                <EntityCard
                  key={c.id}
                  href={`/circles/${c.slug}`}
                  title={c.name}
                  context={c.hub ? c.hub.name : undefined}
                  description={c.about ?? undefined}
                  meta={
                    <>
                      <span className="inline-flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" aria-hidden />
                        {c.member_count} {c.member_count === 1 ? 'member' : 'members'}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <CalendarDays className="h-3.5 w-3.5" aria-hidden />
                        {upcomingCount} upcoming
                      </span>
                    </>
                  }
                />
              )
            })}
          </div>
        )}
        {!leadsNothing && (
          <p className="mt-3 text-sm text-muted">
            Managing a circle happens on its own page. Open one and use the Settings control to edit
            it, welcome members, or add an event.
          </p>
        )}
      </section>

      {!leadsNothing && (
        <section>
          <SectionHeader title="Upcoming in your circles" count={upcoming.length} />
          {upcoming.length === 0 ? (
            <EmptyState
              variant="cleared"
              title="Nothing on the calendar yet"
              description="When you schedule a gathering in one of your circles, it shows up here. Add one from the circle's page."
            />
          ) : (
            <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
              {upcoming.map((e) => (
                <li key={e.id}>
                  <Link
                    href={`/events/${e.slug}`}
                    className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-surface-elevated motion-reduce:transition-none"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-text">{e.title}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-subtle">
                        <span className="inline-flex items-center gap-1">
                          <CalendarDays className="h-3.5 w-3.5" aria-hidden />
                          {formatEventDate(e.starts_at)}
                        </span>
                        {e.location && (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="h-3.5 w-3.5" aria-hidden />
                            <span className="truncate">{e.location}</span>
                          </span>
                        )}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </DashboardTemplate>
  )
}
