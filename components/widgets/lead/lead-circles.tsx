import { Users, CalendarDays } from 'lucide-react'
import { getCallerProfile } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'
import { EntityCard } from '@/components/cards/entity-card'
import { getLedCircles } from '@/app/(main)/lead/load-led-circles'

// Leadership dashboard layout module (ADR-270): the anchor block — the circles this leader
// hosts/stewards, each with its member count and a quiet count of what is coming up. Self-fetching
// RSC scoped to the caller via getCallerProfile; getLedCircles is request-cached so it shares the
// one read with the other lead blocks. This block never self-hides: when the leader hosts nothing
// it shows the aspirational EmptyState so the dashboard always has a home base.
export async function LeadCircles(): Promise<React.ReactElement | null> {
  const me = await getCallerProfile()
  if (!me) return null

  const circles = await getLedCircles(me.id)
  const leadsNothing = circles.length === 0

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

  return (
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
  )
}
