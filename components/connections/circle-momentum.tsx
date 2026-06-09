import { Users, UserPlus, Link2, Calendar } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { ModuleCard } from '@/components/modules/module-card'
import { getCircleMomentum } from '@/lib/connections/metrics'

// Circle "vital signs" — aggregate momentum for the info rail (ADR-186, P6). Counts
// only: members, new members + new ties this week, upcoming events. Never member
// names — this is the circle warming or quieting, read as encouragement, not a
// leaderboard. Renders nothing if the RPC returns null or there's no signal at all.

function MomentumStat({ label, value, Icon }: { label: string; value: string; Icon: LucideIcon }) {
  return (
    <div className="rounded-2xl bg-surface-elevated/60 px-3 py-2.5 text-center">
      <Icon className="mx-auto mb-1 h-3.5 w-3.5 text-subtle" />
      <div className="text-lg font-bold leading-none tabular-nums text-text">{value}</div>
      <div className="mt-1 text-xs text-subtle">{label}</div>
    </div>
  )
}

export async function CircleMomentum({ circleId }: { circleId: string }) {
  const m = await getCircleMomentum(circleId)
  if (!m) return null
  // Nothing worth showing if every signal is zero — keep the rail quiet.
  if (m.members === 0 && m.newMembers7d === 0 && m.newTies7d === 0 && m.upcomingEvents === 0) {
    return null
  }

  const warming = m.newMembers7d > 0 || m.newTies7d > 0
  const caption = warming ? 'Warming up this week.' : 'Quiet this week — a good time to gather.'

  return (
    <ModuleCard title="Momentum">
      <p className="mb-2 px-1 text-xs text-muted">{caption}</p>
      <div className="grid grid-cols-2 gap-2">
        <MomentumStat label="Members" value={m.members.toLocaleString()} Icon={Users} />
        <MomentumStat label="New this week" value={m.newMembers7d.toLocaleString()} Icon={UserPlus} />
        <MomentumStat
          label="New connections"
          value={m.newTies7d.toLocaleString()}
          Icon={Link2}
        />
        <MomentumStat label="Upcoming events" value={m.upcomingEvents.toLocaleString()} Icon={Calendar} />
      </div>
    </ModuleCard>
  )
}
