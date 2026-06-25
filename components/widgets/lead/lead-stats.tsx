import { CircleDot, Users, CalendarDays, Network } from 'lucide-react'
import { getCallerProfile } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { StatCard } from '@/components/ui/stat-card'
import { getLedCircles, getLedHubs, getLedNexuses } from '@/app/(main)/lead/load-led-circles'

// Leadership dashboard layout module (ADR-270): the headline stat band for what a leader runs —
// circles led, total members across them, upcoming events in those circles, and networks under
// them (hubs + nexuses). Self-fetching RSC scoped to the caller via getCallerProfile; the led
// reads share getLedCircles' request cache. Renders nothing when the leader leads nothing.
export async function LeadStats(): Promise<React.ReactElement | null> {
  const me = await getCallerProfile()
  if (!me) return null

  const [circles, hubs, nexuses] = await Promise.all([
    getLedCircles(me.id),
    getLedHubs(me.id),
    getLedNexuses(me.id),
  ])

  const networkCount = hubs.length + nexuses.length
  if (circles.length === 0 && networkCount === 0) return null

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
    <div className="grid grid-cols-2 gap-3 @2xl:grid-cols-4">
      <StatCard label="Circles you lead" value={circles.length} icon={CircleDot} />
      <StatCard label="Members" value={totalMembers} icon={Users} />
      <StatCard label="Upcoming events" value={upcomingEvents} icon={CalendarDays} />
      <StatCard label="Networks" value={networkCount} icon={Network} />
    </div>
  )
}
