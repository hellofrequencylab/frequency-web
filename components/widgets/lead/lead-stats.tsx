import { CircleDot, Users, CalendarDays, Network, Building2 } from 'lucide-react'
import { getCallerProfile } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { StatCard } from '@/components/ui/stat-card'
import { getLedCircles, getLedHubs, getLedNexuses } from '@/app/(main)/lead/load-led-circles'
import { listOperatedSpaces } from '@/lib/spaces/operated'

// Leadership hub DASHBOARD header (ADR-270, hub redesign): the headline metric band for everything a
// leader stewards — circles led, members reached across them, Spaces they run, upcoming events in
// those circles, and networks (hubs + nexuses) under them. Self-fetching RSC scoped to the caller via
// getCallerProfile; the led reads share getLedCircles' request cache and listOperatedSpaces is itself
// request-cached (shared with the lead-spaces module). ALWAYS renders now — it is the dashboard anchor
// at the top of the hub, so a new leader sees the (aspirational, zeroed) board rather than nothing.
export async function LeadStats(): Promise<React.ReactElement | null> {
  const me = await getCallerProfile()
  if (!me) return null

  const [circles, hubs, nexuses, spaces] = await Promise.all([
    getLedCircles(me.id),
    getLedHubs(me.id),
    getLedNexuses(me.id),
    listOperatedSpaces(me.id),
  ])

  const networkCount = hubs.length + nexuses.length
  const totalMembers = circles.reduce((sum, c) => sum + (c.member_count ?? 0), 0)

  // Upcoming events across the led circles only — scoped to their ids, never platform-wide.
  let upcomingEvents = 0
  const circleIds = circles.map((c) => c.id)
  if (circleIds.length > 0) {
    const { data } = await createAdminClient()
      .from('events')
      .select('id', { count: 'exact', head: false })
      .in('scope_id', circleIds)
      .eq('is_cancelled', false)
      .gte('starts_at', new Date().toISOString())
    upcomingEvents = (data ?? []).length
  }

  return (
    <div className="grid grid-cols-2 gap-3 @lg:grid-cols-3 @2xl:grid-cols-5">
      <StatCard bordered label="Circles you lead" value={circles.length} icon={CircleDot} />
      <StatCard bordered label="Members reached" value={totalMembers} icon={Users} />
      <StatCard bordered label="Spaces you run" value={spaces.length} icon={Building2} href="/spaces/operating" />
      <StatCard bordered label="Upcoming events" value={upcomingEvents} icon={CalendarDays} />
      <StatCard bordered label="Networks" value={networkCount} icon={Network} />
    </div>
  )
}
