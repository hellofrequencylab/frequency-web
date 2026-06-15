import Link from 'next/link'
import { Users, CalendarDays, MapPin, Building2, ClipboardList, GraduationCap, ArrowUpRight } from 'lucide-react'
import { requireLeadFloor } from '@/lib/admin/guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { DashboardTemplate } from '@/components/templates'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'
import { EntityCard } from '@/components/cards/entity-card'
import { formatEventDate } from '@/lib/utils'
import { getEventsAdminData } from '@/app/(main)/admin/events/load-events'
import { getLedCircles, getLedHubs, getLedNexuses } from './load-led-circles'

// The Leadership dashboard (/lead, label "Leadership", ADR-266): the CONSOLIDATED home for
// volunteer community leaders (Crew/Host/Guide/Mentor) to manage THEIR community after
// /admin became staff-only. It gathers what you steward — the circles you host, the networks
// under you, crew tasks, and your leader training — and links into the existing controls
// (each circle is still managed from its own page via the Settings control / PageAdminBar).
//
// SCOPING (security): every read is keyed to the caller's own profile —
//   • getLedCircles(role, profileId) mirrors the /admin/circles per-role scoping
//     (host_id = me / hubs I guide / nexuses I mentor) — never an "all" read.
//   • getLedHubs / getLedNexuses are guide_id = me / mentor_id = me.
//   • getEventsAdminData(profileId) is already scoped to the host's circles + events.
//   • the per-circle upcoming-event counts are filtered to the led circle ids.
// There is no platform-wide query on this page.

export const metadata = {
  title: 'Leadership',
  description: 'Lead your community: the circles you host, the networks under you, crew tasks, and your training.',
}

export default async function LeadershipPage() {
  const { profileId, role } = await requireLeadFloor()

  const [circles, eventsData, hubs, nexuses] = await Promise.all([
    getLedCircles(role, profileId),
    getEventsAdminData(profileId),
    getLedHubs(profileId),
    getLedNexuses(profileId),
  ])
  const upcoming = eventsData.upcoming

  // Quiet per-circle upcoming-event counts, scoped to the led circles only.
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
  const hasNetwork = hubs.length > 0 || nexuses.length > 0

  return (
    <DashboardTemplate
      eyebrow="Leadership"
      title="Lead your community"
      description="Everything you steward in one place: your circles, the networks under you, crew tasks, and your leader training. Open a circle to manage it, post, or run an event."
      width="default"
    >
      <section>
        <SectionHeader title="Circles you host" count={circles.length} />
        {leadsNothing ? (
          <EmptyState
            title="You are not hosting a circle yet"
            description="Hosting a circle gives you a home base: a place to gather members, post updates, and run events. When you host or steward one, it shows up here with its members and what is coming up."
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

      {hasNetwork && (
        <section>
          <SectionHeader title="Your networks" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {nexuses.map((n) => (
              <EntityCard
                key={n.id}
                href={`/nexuses/${n.slug}`}
                title={n.name}
                context="Nexus"
                meta={
                  <span className="inline-flex items-center gap-1">
                    <Building2 className="h-3.5 w-3.5" aria-hidden />
                    {n.hub_count} {n.hub_count === 1 ? 'hub' : 'hubs'}
                  </span>
                }
              />
            ))}
            {hubs.map((h) => (
              <EntityCard
                key={h.id}
                href={`/hubs/${h.slug}`}
                title={h.name}
                context="Hub"
                meta={
                  <span className="inline-flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" aria-hidden />
                    {h.circle_count} {h.circle_count === 1 ? 'circle' : 'circles'}
                  </span>
                }
              />
            ))}
          </div>
        </section>
      )}

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

      <section>
        <SectionHeader title="Leadership tools" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <ToolCard
            href="/lead/crew-tasks"
            Icon={ClipboardList}
            title="Crew tasks"
            desc="Internal volunteer tasks that support your circles. Create them, see who claimed what, and release a stalled claim."
          />
          <ToolCard
            href="/training"
            Icon={GraduationCap}
            title="Leader training"
            desc="The advancement curriculum for your role. Materials to start and run a circle well."
          />
        </div>
      </section>
    </DashboardTemplate>
  )
}

function ToolCard({
  href,
  Icon,
  title,
  desc,
}: {
  href: string
  Icon: typeof ClipboardList
  title: string
  desc: string
}) {
  return (
    <Link
      href={href}
      className="group flex items-start gap-3 rounded-2xl border border-border bg-surface p-4 transition-colors hover:border-primary/40 hover:bg-surface-elevated motion-reduce:transition-none"
    >
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-bg text-primary-strong">
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1 text-sm font-semibold text-text">
          {title}
          <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-subtle opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
        </span>
        <span className="mt-0.5 block text-xs leading-relaxed text-muted">{desc}</span>
      </span>
    </Link>
  )
}
